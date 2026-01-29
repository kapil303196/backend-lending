/**
 * Twilio Voice Intelligence / Conversational Intelligence Service
 *
 * This service handles transcription using Twilio's built-in transcription capabilities
 * instead of using OpenAI Whisper for transcription.
 *
 * Benefits:
 * - No need to download audio files
 * - Supports recordings of any length (not limited like <Record> transcribe)
 * - Multilingual support
 * - Can integrate with Twilio's Language Operators for sentiment analysis
 *
 * NOTE: Twilio Conversational Intelligence API requires direct REST API calls
 * as it's not available in the standard twilio npm package.
 *
 * @see https://www.twilio.com/docs/conversational-intelligence
 */

const axios = require("axios");
const { getTwilioConfig } = require("../utils/twilioHelpers");
const AdminConfig = require("../models/AdminConfig");

/**
 * Get Twilio Intelligence configuration from AdminConfig
 * @returns {Promise<Object>} Twilio Intelligence configuration
 */
async function getTwilioIntelligenceConfig() {
  const config = await AdminConfig.findOne({ configId: "default" });
  return {
    enabled: config?.twilioIntelligence?.enabled ?? false,
    serviceSid: config?.twilioIntelligence?.serviceSid || null,
    autoTranscribe: config?.twilioIntelligence?.autoTranscribe ?? false,
    language: config?.twilioIntelligence?.language || "en-US",
  };
}

/**
 * Make authenticated request to Twilio Conversational Intelligence API
 * Twilio uses form-urlencoded for POST requests, not JSON
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint (after /v2/)
 * @param {Object} data - Request body (for POST/PUT) - will be form-encoded
 * @returns {Promise<Object>} API response
 */
async function twilioIntelligenceRequest(method, endpoint, data = null) {
  const twilioConfig = await getTwilioConfig();

  const url = `https://intelligence.twilio.com/v2/${endpoint}`;

  const config = {
    method,
    url,
    auth: {
      username: twilioConfig.accountSid,
      password: twilioConfig.authToken,
    },
  };

  if (data && (method === "POST" || method === "PUT")) {
    // Twilio uses form-urlencoded, not JSON
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object") {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value);
      }
    }
    config.data = formData.toString();
    config.headers = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  const response = await axios(config);
  return response.data;
}

/**
 * Create a transcript using Twilio Conversational Intelligence API
 * This initiates transcription of a Twilio recording
 *
 * @param {string} recordingSid - The Twilio Recording SID
 * @param {Object} options - Optional configuration
 * @param {string} options.channel - Channel name for the participant
 * @returns {Promise<Object>} Transcript resource
 */
async function createTranscript(recordingSid, options = {}) {
  try {
    const intelligenceConfig = await getTwilioIntelligenceConfig();

    if (!intelligenceConfig.enabled || !intelligenceConfig.serviceSid) {
      throw new Error("Twilio Intelligence is not configured. Please set up Intelligence Service SID in admin panel.");
    }

    // Create transcript using Twilio's Conversational Intelligence REST API
    // Channel is passed as a JSON string in form-urlencoded format
    const channelData = {
      media_properties: {
        source_sid: recordingSid,
      },
      participants: [
        {
          user_id: options.agentId || "agent",
          channel_participant: 1,
          full_name: options.agentName || "Agent",
        },
        {
          user_id: options.customerId || "customer",
          channel_participant: 2,
          full_name: options.customerName || "Customer",
        },
      ],
    };

    const requestData = {
      ServiceSid: intelligenceConfig.serviceSid,
      Channel: channelData, // Will be JSON stringified by twilioIntelligenceRequest
    };

    const transcript = await twilioIntelligenceRequest("POST", "Transcripts", requestData);

    console.log(`Twilio Intelligence: Created transcript ${transcript.sid} for recording ${recordingSid}`);

    return {
      transcriptSid: transcript.sid,
      status: transcript.status,
      dateCreated: transcript.date_created,
      duration: transcript.duration,
    };
  } catch (error) {
    console.error("Twilio Intelligence createTranscript error:", error.response?.data || error.message);
    const errorMsg = error.response?.data?.message || error.message;
    throw new Error(`Failed to create Twilio transcript: ${errorMsg}`);
  }
}

/**
 * Get transcript status and content from Twilio Intelligence
 *
 * @param {string} transcriptSid - The Twilio Transcript SID
 * @returns {Promise<Object>} Transcript with sentences
 */
async function getTranscript(transcriptSid) {
  try {
    // Get transcript details
    const transcript = await twilioIntelligenceRequest("GET", `Transcripts/${transcriptSid}`);

    // Get sentences if transcript is completed
    let sentences = [];
    let fullText = "";

    if (transcript.status === "completed") {
      try {
        const sentencesResponse = await twilioIntelligenceRequest(
          "GET",
          `Transcripts/${transcriptSid}/Sentences`
        );

        sentences = (sentencesResponse.sentences || []).map(s => ({
          participantId: s.participant,
          text: s.transcript,
          startTime: s.start_time,
          endTime: s.end_time,
          confidence: s.confidence,
        }));

        // Combine all sentences into full text with speaker labels
        fullText = sentences
          .map(s => `[${s.participantId === 1 ? "Agent" : "Customer"}]: ${s.text}`)
          .join("\n");
      } catch (sentenceError) {
        console.warn("Could not fetch sentences:", sentenceError.message);
      }
    }

    return {
      transcriptSid: transcript.sid,
      status: transcript.status,
      duration: transcript.duration,
      dateCreated: transcript.date_created,
      dateUpdated: transcript.date_updated,
      sentences,
      fullText,
    };
  } catch (error) {
    console.error("Twilio Intelligence getTranscript error:", error.response?.data || error.message);
    throw new Error(`Failed to get Twilio transcript: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * List all transcripts for an account (useful for debugging)
 *
 * @param {Object} options - Filter options
 * @param {number} options.limit - Maximum number to return
 * @returns {Promise<Array>} List of transcripts
 */
async function listTranscripts(options = {}) {
  try {
    const response = await twilioIntelligenceRequest(
      "GET",
      `Transcripts?PageSize=${options.limit || 20}`
    );

    return (response.transcripts || []).map(t => ({
      transcriptSid: t.sid,
      status: t.status,
      duration: t.duration,
      dateCreated: t.date_created,
    }));
  } catch (error) {
    console.error("Twilio Intelligence listTranscripts error:", error.response?.data || error.message);
    throw new Error(`Failed to list transcripts: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete a transcript from Twilio Intelligence
 *
 * @param {string} transcriptSid - The Twilio Transcript SID
 * @returns {Promise<boolean>} Success status
 */
async function deleteTranscript(transcriptSid) {
  try {
    await twilioIntelligenceRequest("DELETE", `Transcripts/${transcriptSid}`);
    console.log(`Twilio Intelligence: Deleted transcript ${transcriptSid}`);
    return true;
  } catch (error) {
    console.error("Twilio Intelligence deleteTranscript error:", error.response?.data || error.message);
    throw new Error(`Failed to delete transcript: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Get Intelligence Service details
 *
 * @param {string} serviceSid - The Intelligence Service SID
 * @returns {Promise<Object>} Service details
 */
async function getService(serviceSid) {
  try {
    const service = await twilioIntelligenceRequest("GET", `Services/${serviceSid}`);
    return {
      sid: service.sid,
      friendlyName: service.friendly_name,
      uniqueName: service.unique_name,
      autoTranscribe: service.auto_transcribe,
      dataLogging: service.data_logging,
      dateCreated: service.date_created,
    };
  } catch (error) {
    console.error("Twilio Intelligence getService error:", error.response?.data || error.message);
    throw new Error(`Failed to get service: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Process a call's recording using Twilio Intelligence
 * This is the main function to call when a recording is ready
 *
 * @param {Object} callDoc - Call document from database
 * @returns {Promise<Object>} Result with transcriptSid and status
 */
async function processRecordingWithTwilioIntelligence(callDoc) {
  const intelligenceConfig = await getTwilioIntelligenceConfig();

  if (!intelligenceConfig.enabled) {
    return { success: false, error: "Twilio Intelligence is not enabled" };
  }

  if (!callDoc.recordingSid) {
    return { success: false, error: "No recording SID available" };
  }

  try {
    // Create transcript request
    const result = await createTranscript(callDoc.recordingSid, {
      agentId: callDoc.agentId?.toString() || "agent",
      agentName: callDoc.agentExtension || "Agent",
      customerId: callDoc.mcaId?.toString() || "customer",
      customerName: callDoc.businessName || "Customer",
    });

    // Update call document with transcript info
    callDoc.twilioTranscript = {
      transcriptSid: result.transcriptSid,
      status: "processing",
      requestedAt: new Date(),
    };
    await callDoc.save();

    return {
      success: true,
      transcriptSid: result.transcriptSid,
      status: result.status,
    };
  } catch (error) {
    console.error("processRecordingWithTwilioIntelligence error:", error);

    // Update call document with error
    callDoc.twilioTranscript = {
      status: "failed",
      error: error.message,
      requestedAt: new Date(),
    };
    await callDoc.save();

    return { success: false, error: error.message };
  }
}

/**
 * Handle webhook callback from Twilio Intelligence when transcription is complete
 *
 * Twilio sends webhooks with snake_case field names:
 * - account_sid
 * - service_sid
 * - transcript_sid
 * - event_type: "voice_intelligence_transcript_available" or "voice_intelligence_transcript_failed"
 *
 * @param {Object} webhookData - Webhook payload from Twilio
 * @returns {Promise<Object>} Updated call document
 */
async function handleTranscriptionWebhook(webhookData) {
  const Call = require("../models/Call");

  // Twilio uses snake_case in webhooks
  const transcriptSid = webhookData.transcript_sid || webhookData.TranscriptSid;
  const eventType = webhookData.event_type || webhookData.EventType;
  const serviceSid = webhookData.service_sid || webhookData.ServiceSid;

  console.log(`Twilio Intelligence webhook: TranscriptSid=${transcriptSid}, EventType=${eventType}`);

  if (!transcriptSid) {
    console.warn("Twilio Intelligence webhook: Missing transcript_sid");
    return null;
  }

  // Find the call by transcript SID
  let callDoc = await Call.findOne({
    "twilioTranscript.transcriptSid": transcriptSid,
  });

  if (!callDoc) {
    console.warn(`Twilio Intelligence webhook: No call found for TranscriptSid=${transcriptSid}`);
    return null;
  }

  // Check event type - "voice_intelligence_transcript_available" means completed
  const isCompleted = eventType === "voice_intelligence_transcript_available";
  const isFailed = eventType === "voice_intelligence_transcript_failed";

  if (isCompleted) {
    // Fetch the full transcript
    const transcriptData = await getTranscript(transcriptSid);

    callDoc.twilioTranscript = {
      transcriptSid: transcriptSid,
      status: "completed",
      completedAt: new Date(),
      duration: transcriptData.duration,
    };

    // Update the main transcription field
    callDoc.transcription = {
      text: transcriptData.fullText,
      status: "completed",
      processedAt: new Date(),
      source: "twilio-intelligence",
    };

    // Store sentences for detailed analysis
    if (!callDoc.metadata) callDoc.metadata = {};
    callDoc.metadata.twilioTranscriptSentences = transcriptData.sentences;

    await callDoc.save();

    console.log(`Twilio Intelligence: Transcription completed for call ${callDoc.twilioCallSid}`);

    // Optionally generate summary using OpenAI
    const { summarizeTranscription } = require("./openaiService");
    const AdminConfig = require("../models/AdminConfig");
    const config = await AdminConfig.findOne({ configId: "default" });

    if (config?.openai?.enabled && config?.openai?.autoSummarize) {
      try {
        callDoc.summary.status = "processing";
        await callDoc.save();

        const summaryText = await summarizeTranscription(transcriptData.fullText, {
          direction: callDoc.direction,
          businessName: callDoc.businessName,
          agentExtension: callDoc.agentExtension,
        });

        callDoc.summary = {
          text: summaryText,
          status: "completed",
          processedAt: new Date(),
          model: config.openai.model || "gpt-4o-mini",
        };
        await callDoc.save();

        console.log(`Twilio Intelligence: Summary generated for call ${callDoc.twilioCallSid}`);
      } catch (summaryError) {
        console.error("Summary generation error:", summaryError);
        callDoc.summary = {
          status: "failed",
          error: summaryError.message,
          processedAt: new Date(),
        };
        await callDoc.save();
      }
    }
  } else if (isFailed) {
    const errorMessage = webhookData.error_message || webhookData.ErrorMessage || "Transcription failed";

    callDoc.twilioTranscript = {
      transcriptSid: transcriptSid,
      status: "failed",
      error: errorMessage,
      completedAt: new Date(),
    };

    callDoc.transcription = {
      status: "failed",
      error: errorMessage,
      processedAt: new Date(),
    };

    await callDoc.save();

    console.log(`Twilio Intelligence: Transcription failed for call ${callDoc.twilioCallSid}`);
  } else {
    console.log(`Twilio Intelligence: Unknown event type ${eventType} for call ${callDoc.twilioCallSid}`);
  }

  return callDoc;
}

/**
 * Check if Twilio Intelligence is properly configured
 * @returns {Promise<Object>} Configuration status
 */
async function checkConfiguration() {
  const config = await getTwilioIntelligenceConfig();

  const issues = [];

  if (!config.enabled) {
    issues.push("Twilio Intelligence is not enabled in admin panel");
  }

  if (!config.serviceSid) {
    issues.push("Intelligence Service SID is not configured");
  }

  // Try to verify the service exists
  if (config.serviceSid) {
    try {
      const service = await getService(config.serviceSid);

      return {
        configured: issues.length === 0,
        enabled: config.enabled,
        serviceSid: config.serviceSid,
        serviceName: service.friendlyName,
        autoTranscribe: config.autoTranscribe,
        issues,
      };
    } catch (error) {
      issues.push(`Invalid Service SID: ${error.message}`);
    }
  }

  return {
    configured: false,
    enabled: config.enabled,
    serviceSid: config.serviceSid,
    autoTranscribe: config.autoTranscribe,
    issues,
  };
}

module.exports = {
  getTwilioIntelligenceConfig,
  createTranscript,
  getTranscript,
  listTranscripts,
  deleteTranscript,
  getService,
  processRecordingWithTwilioIntelligence,
  handleTranscriptionWebhook,
  checkConfiguration,
};
