const twilio = require("twilio");
const AdminConfig = require("../models/AdminConfig");

/**
 * Middleware to validate Twilio webhook requests using Twilio's signature validation
 * This is the official and recommended way to verify Twilio webhooks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function validateTwilioSignature(req, res, next) {
  try {
    // Get Twilio configuration
    const config = await AdminConfig.findOne({ configId: "default" });
    if (!config?.twilio?.authToken) {
      console.error("Twilio authToken not configured");
      return res.status(503).type("text/xml").send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Service temporarily unavailable</Say></Response>'
      );
    }

    // Get the signature from the header
    const signature = req.headers["x-twilio-signature"];
    const url = req.protocol + "://" + req.get("host") + req.originalUrl;

    // Validate the signature
    const isValid = twilio.validateRequest(
      config.twilio.authToken,
      signature,
      url,
      req.body || {}
    );

    if (!isValid) {
      console.warn("Invalid Twilio signature", {
        url,
        signature: signature ? "present" : "missing",
        ip: req.ip,
      });
      return res.status(403).type("text/xml").send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid request</Say></Response>'
      );
    }

    next();
  } catch (error) {
    console.error("Twilio signature validation error:", error);
    res.status(500).type("text/xml").send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Server error</Say></Response>'
    );
  }
}

/**
 * Helper to normalize phone numbers (E.164 format)
 * @param {string} phone - Phone number in any format
 * @returns {string|null} Normalized phone number in E.164 format (+1234567890) or null if invalid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");
  // If doesn't start with +, assume US number and add +1
  if (!cleaned.startsWith("+")) {
    cleaned = "+1" + cleaned.replace(/^1/, "");
  }
  // Basic validation: should be 10-15 digits after +
  const digits = cleaned.replace(/^\+/, "");
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return cleaned;
}

/**
 * Validate phone number format (E.164)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 */
function isValidPhoneNumber(phone) {
  if (!phone) return false;
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return false;
  // E.164 format: + followed by 1-15 digits
  return /^\+[1-9]\d{1,14}$/.test(normalized);
}

/**
 * Validate extension format (3-4 digits)
 * @param {string|number} extension - Extension to validate
 * @returns {boolean} True if valid extension format (3-4 digits)
 */
function isValidExtension(extension) {
  if (!extension) return false;
  return /^\d{3,4}$/.test(extension.toString().trim());
}

module.exports = {
  validateTwilioSignature,
  normalizePhoneNumber,
  isValidPhoneNumber,
  isValidExtension,
};
