const twilio = require("twilio");
const AdminConfig = require("../models/AdminConfig");
const Call = require("../models/Call");
const UserResponse = require("../models/UserResponse");
const TwilioAccount = require("../models/TwilioAccount");
const { normalizePhoneNumber } = require("../middleware/twilioValidation");

/**
 * Resolve a Twilio account configuration.
 *
 * Priority order:
 * 1. Specific TwilioAccount by ID (if accountId provided)
 * 2. TwilioAccount marked as isDefault === true
 * 3. Legacy single-account configuration stored on AdminConfig.twilio
 *
 * The returned object normalizes the shape so existing callers expecting
 * AdminConfig.twilio continue to work.
 *
 * @param {Object} [options]
 * @param {string} [options.accountId] - Optional TwilioAccount _id to use
 * @returns {Promise<Object>} Twilio configuration object
 * @throws {Error} If no Twilio configuration is available
 */
async function getTwilioConfig(options = {}) {
  const { accountId } = options || {};

  // 1. Explicit TwilioAccount by ID
  if (accountId) {
    const account = await TwilioAccount.findById(accountId).lean();
    if (account) {
      return mapTwilioAccountToConfig(account);
    }
  }

  // 2. Default TwilioAccount (if any)
  const defaultAccount = await TwilioAccount.findOne({ isDefault: true }).lean();
  if (defaultAccount) {
    return mapTwilioAccountToConfig(defaultAccount);
  }

  // 3. Legacy AdminConfig.twilio (single-account mode)
  const adminConfig = await AdminConfig.findOne({ configId: "default" }).lean();
  if (adminConfig?.twilio?.accountSid && adminConfig?.twilio?.authToken) {
    return adminConfig.twilio;
  }

  throw new Error(
    "Twilio is not configured. Please configure at least one Twilio account in the admin panel."
  );
}

/**
 * Map a TwilioAccount document to the legacy AdminConfig.twilio shape
 * so existing controller logic can keep using twilioConfig.* safely.
 *
 * @param {Object} account - TwilioAccount (lean object)
 * @returns {Object}
 */
function mapTwilioAccountToConfig(account) {
  const primaryNumberDoc =
    account.phoneNumbers?.find((n) => n.isPrimary && n.isActive) ||
    account.phoneNumbers?.find((n) => n.isOutboundCallerId && n.isActive) ||
    account.phoneNumbers?.find((n) => n.isActive) ||
    null;

  const primaryNumber = primaryNumberDoc?.phoneNumber || "";

  return {
    // Core credentials
    accountSid: account.accountSid,
    authToken: account.authToken,
    apiKey: account.apiKey || "",
    apiSecret: account.apiSecret || "",

    // TwiML Application SID (required for Voice SDK)
    twimlAppSid: account.twimlAppSid || "",

    // Numbers / callerId
    primaryNumber,
    outboundCallerId: primaryNumber,

    // Recording preferences
    recordings: {
      enabled: account.recordings?.enabled ?? true,
      recordInbound: account.recordings?.recordInbound ?? true,
      recordOutbound: account.recordings?.recordOutbound ?? true,
    },

    // Webhook secret
    webhookSecret: account.webhookSecret || "",

    // Extra metadata for new multi-account aware callers
    _accountId: account._id?.toString?.() || null,
    _phoneNumbers: account.phoneNumbers || [],
    _name: account.name,
    _isDefault: account.isDefault,
  };
}

/**
 * Create Twilio client instance
 * @param {Object} [options]
 * @param {string} [options.accountId] - Optional TwilioAccount _id to bind client to
 * @returns {twilio.Twilio} Twilio client
 * @throws {Error} If Twilio is not configured
 */
async function createTwilioClient() {
  const twilioConfig = await getTwilioConfig();
  return twilio(twilioConfig.accountSid, twilioConfig.authToken);
}

/**
 * Get base URL for TwiML callbacks
 * Uses API_BASE_URL env var or constructs from request
 * Production-ready: handles proxies, load balancers, and various deployment scenarios
 * @param {Object} req - Express request object
 * @returns {string} Base URL (e.g., "https://api.example.com")
 * @throws {Error} If unable to determine base URL
 */
function getBaseUrl(req) {
  // Priority 1: Explicit environment variable (most reliable for production)
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/$/, "");
  }

  // Priority 2: Construct from request headers (for dynamic environments)
  // Check for forwarded protocol (common in proxies/load balancers)
  const forwardedProto = req.headers["x-forwarded-proto"];
  const isSecure =
    req.secure ||
    forwardedProto === "https" ||
    forwardedProto === "HTTPS";

  const protocol = isSecure ? "https" : "http";

  // Check for forwarded host (common in reverse proxies)
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = forwardedHost || req.headers.host || req.get("host");

  if (!host) {
    console.error("Unable to determine base URL from request");
    throw new Error("API_BASE_URL environment variable must be set");
  }

  return `${protocol}://${host}`;
}

/**
 * Attach business context to a call document based on phone number matching
 * This attempts to link calls to existing UserResponse/MCA records
 * @param {Object} callDoc - Call document (Mongoose document)
 * @returns {Promise<Object>} Call document with business context attached
 */
async function attachBusinessContext(callDoc) {
  try {
    if (!callDoc) return callDoc;

    const phone =
      callDoc.direction === "inbound" ? callDoc.fromNumber : callDoc.toNumber;
    if (!phone) return callDoc;

    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return callDoc;

    // Remove + and leading 1 for US numbers to match various formats in DB
    const searchPatterns = [
      normalized, // E.164 format
      normalized.replace(/^\+1/, ""), // Without +1
      normalized.replace(/^\+/, ""), // Without +
    ];

    // Try to find matching UserResponse
    const response = await UserResponse.findOne({
      $or: [
        { "userContact.phone": { $in: searchPatterns } },
        { "formData.phone": { $in: searchPatterns } },
        { "formData.businessPhone": { $in: searchPatterns } },
        { "formData.ownerPhone": { $in: searchPatterns } },
        { "formData.ownerInfo.phone": { $in: searchPatterns } },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("mcaId")
      .lean();

    if (response) {
      callDoc.userResponseId = response._id;
      callDoc.mcaId = response.mcaId?._id || null;
      callDoc.businessName =
        response.formData?.legalBusinessName ||
        response.formData?.businessInfo?.businessName ||
        response.mcaId?.company ||
        callDoc.businessName ||
        null;
    }

    return callDoc;
  } catch (error) {
    // Don't fail the call if business matching fails
    console.error("Error attaching business context:", error);
    return callDoc;
  }
}

/**
 * Create or update Call document with proper error handling
 * @param {Object} callData - Call data object
 * @param {string} callData.twilioCallSid - Twilio call ID (required)
 * @returns {Promise<Object>} Saved call document
 * @throws {Error} If twilioCallSid is missing or save fails
 */
async function upsertCallRecord(callData) {
  try {
    if (!callData.twilioCallSid) {
      throw new Error("twilioCallSid is required");
    }

    let callDoc = await Call.findOne({ twilioCallSid: callData.twilioCallSid });

    if (callDoc) {
      // Update existing call
      Object.assign(callDoc, callData);
      await callDoc.save();
      return callDoc;
    } else {
      // Create new call
      callDoc = new Call(callData);
      await callDoc.save();
      return callDoc;
    }
  } catch (error) {
    console.error("Error upserting call record:", error);
    throw error;
  }
}

/**
 * Generate TwiML URL for callbacks
 * @param {string} baseUrl - Base URL (e.g., "https://api.example.com")
 * @param {string} path - API path (e.g., "/ivr/extension")
 * @param {Object} [params={}] - Query parameters
 * @returns {string} Complete URL with query parameters
 */
function buildTwiMLUrl(baseUrl, path, params = {}) {
  const url = new URL(`${baseUrl}/api/twilio${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });
  return url.toString();
}

module.exports = {
  getTwilioConfig,
  createTwilioClient,
  getBaseUrl,
  attachBusinessContext,
  upsertCallRecord,
  buildTwiMLUrl,
};
