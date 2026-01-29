const express = require("express");
const router = express.Router();
const {
  handleInboundCall,
  handleExtensionSelection,
  handleCallStatus,
  handleRecordingStatus,
  listCalls,
  listExtensions,
  createOrUpdateExtension,
  deleteExtension,
  createOutboundCall,
  generateDialerToken,
  searchCompanies,
  outboundBridge,
  getCallStats,
  exportCallsToCSV,
  handleVoicemail,
  voicemailGreeting,
  listTwilioAccounts,
  createOrUpdateTwilioAccount,
  deleteTwilioAccount,
  listTwilioCallerIds,
  getDiagnostics,
  getCallRecording,
  transcribeCall,
  getCallById,
  cleanupStaleCalls,
  syncCallDuration,
  // Twilio Intelligence endpoints
  handleIntelligenceWebhook,
  transcribeWithTwilioIntelligence,
  getTwilioTranscript,
  getIntelligenceStatus,
} = require("../controllers/twilioController");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { validateTwilioSignature } = require("../middleware/twilioValidation");

/**
 * ============================================================================
 * TWILIO WEBHOOK ENDPOINTS (Public, validated by Twilio signature)
 * ============================================================================
 * These endpoints are called by Twilio and must:
 * - Always return valid TwiML XML (even on errors)
 * - Return 200 status codes (Twilio retries on non-200)
 * - Validate Twilio signature for security
 */

// Inbound call webhook - first point of contact
router.post(
  "/voice/inbound",
  express.urlencoded({ extended: false }), // Twilio sends form-encoded data
  validateTwilioSignature,
  handleInboundCall
);

// IVR extension selection handler
router.post(
  "/ivr/extension",
  express.urlencoded({ extended: false }),
  validateTwilioSignature,
  handleExtensionSelection
);

// Call status updates (called multiple times during call lifecycle)
router.post(
  "/call-status",
  express.urlencoded({ extended: false }),
  validateTwilioSignature,
  handleCallStatus
);

// Recording status updates
router.post(
  "/recording-status",
  express.urlencoded({ extended: false }),
  validateTwilioSignature,
  handleRecordingStatus
);

// Outbound bridge TwiML (can be GET or POST)
// Note: For Voice SDK (Client), Twilio POSTs to the TwiML App Voice URL.
// We skip signature validation here since the SDK doesn't sign these requests the same way.
// Security is handled via the Access Token authentication in generateDialerToken.
router.get("/outbound-bridge", outboundBridge);
router.post(
  "/outbound-bridge",
  express.urlencoded({ extended: false }),
  outboundBridge
);

// Voicemail webhooks
router.get("/voicemail-greeting", voicemailGreeting);
router.post(
  "/voicemail-greeting",
  express.urlencoded({ extended: false }),
  validateTwilioSignature,
  voicemailGreeting
);
router.post(
  "/voicemail",
  express.urlencoded({ extended: false }),
  validateTwilioSignature,
  handleVoicemail
);

// Twilio Intelligence webhook (transcription status callback)
// Note: This is called by Twilio Conversational Intelligence when transcription completes
router.post(
  "/intelligence/transcript-status",
  express.urlencoded({ extended: false }),
  handleIntelligenceWebhook
);

/**
 * ============================================================================
 * ADMIN API ENDPOINTS (Protected, requires admin authentication)
 * ============================================================================
 */

// Diagnostics - verify Twilio configuration and webhook URLs
router.get("/diagnostics", authenticate, requireAdmin, getDiagnostics);

// List calls with filters
router.get("/calls", authenticate, requireAdmin, listCalls);

// Export calls to CSV (must be before /calls/:callId to avoid route conflict)
router.get("/calls/export", authenticate, requireAdmin, exportCallsToCSV);

// Call statistics (must be before /calls/:callId to avoid route conflict)
router.get("/calls/stats", authenticate, requireAdmin, getCallStats);

// Cleanup stale calls (must be before /calls/:callId to avoid route conflict)
router.post("/calls/cleanup", authenticate, requireAdmin, cleanupStaleCalls);

// Get single call details
router.get("/calls/:callId", authenticate, requireAdmin, getCallById);

// Get call recording (proxied through server to avoid Twilio auth prompts)
router.get("/calls/:callId/recording", authenticate, requireAdmin, getCallRecording);

// Manually trigger transcription and summary (using OpenAI Whisper)
router.post("/calls/:callId/transcribe", authenticate, requireAdmin, transcribeCall);

// Manually trigger transcription using Twilio Intelligence
router.post("/calls/:callId/transcribe-twilio", authenticate, requireAdmin, transcribeWithTwilioIntelligence);

// Get call transcript (works with both OpenAI and Twilio Intelligence)
router.get("/calls/:callId/transcript", authenticate, requireAdmin, getTwilioTranscript);


// Extension management
router.get("/extensions", authenticate, requireAdmin, listExtensions);
router.post("/extensions", authenticate, requireAdmin, createOrUpdateExtension);
router.put("/extensions/:id", authenticate, requireAdmin, createOrUpdateExtension);
router.delete("/extensions/:id", authenticate, requireAdmin, deleteExtension);

// Outbound dialer
router.get("/dialer/search", authenticate, requireAdmin, searchCompanies);
router.get("/dialer/token", authenticate, requireAdmin, generateDialerToken);
router.post("/dialer/outbound", authenticate, requireAdmin, createOutboundCall);

// Twilio account management (global, multi-account)
router.get("/accounts", authenticate, requireAdmin, listTwilioAccounts);
router.post("/accounts", authenticate, requireAdmin, createOrUpdateTwilioAccount);
router.put("/accounts/:id", authenticate, requireAdmin, createOrUpdateTwilioAccount);
router.delete("/accounts/:id", authenticate, requireAdmin, deleteTwilioAccount);
router.get(
  "/accounts/caller-ids",
  authenticate,
  requireAdmin,
  listTwilioCallerIds
);

// Twilio Intelligence configuration status
router.get("/intelligence/status", authenticate, requireAdmin, getIntelligenceStatus);

// Sync call duration from recording (for fixing duration mismatches)
router.post("/calls/:callId/sync-duration", authenticate, requireAdmin, syncCallDuration);

// Call tagging - AI-generated and custom tags
const {
  generateCallTags,
  addCallTag,
  removeCallTag,
  getAnalyticsDashboard,
  generateAIInsights,
  exportAnalyticsPDF,
  emailAnalyticsReport,
} = require("../controllers/twilioController");

router.post("/calls/:callId/generate-tags", authenticate, requireAdmin, generateCallTags);
router.post("/calls/:callId/tags", authenticate, requireAdmin, addCallTag);
router.delete("/calls/:callId/tags/:tag", authenticate, requireAdmin, removeCallTag);

// Advanced Analytics Dashboard
router.get("/analytics/dashboard", authenticate, requireAdmin, getAnalyticsDashboard);
router.post("/analytics/ai-insights", authenticate, requireAdmin, generateAIInsights);
router.post("/analytics/export-pdf", authenticate, requireAdmin, exportAnalyticsPDF);
router.post("/analytics/email-report", authenticate, requireAdmin, emailAnalyticsReport);

module.exports = router;
