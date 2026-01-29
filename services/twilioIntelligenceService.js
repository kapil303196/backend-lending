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
 * IMPORTANT: Channel Mapping for Voice SDK (Web Dialer)
 * For dual-channel recordings with <Dial record="record-from-answer-dual"> via Voice SDK:
 * - Channel 1 = PSTN/Remote party (Customer being called/calling)
 * - Channel 2 = WebRTC/Local party (Agent using browser dialer)
 *
 * This is counter-intuitive because you might expect Channel 1 to be the "caller",
 * but Twilio routes WebRTC audio (agent) to Channel 2 and PSTN audio (customer) to Channel 1.
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
    //
    // IMPORTANT: For dual-channel recordings with Voice SDK (web dialer):
    // The channel mapping depends on how Twilio routes the audio:
    // - For <Dial record="record-from-answer-dual"> with Voice SDK:
    //   - Channel 1 = PSTN/Remote party (Customer being called)
    //   - Channel 2 = WebRTC/Local party (Agent using browser dialer)
    //
    // This is because Twilio records the "inbound" leg (customer) on channel 1
    // and the "outbound" leg (agent/browser) on channel 2 for Voice SDK calls.
    //
    // We swap the channel_participant values to correctly label speakers:
    // - Customer -> channel_participant: 1
    // - Agent -> channel_participant: 2
    //
    const channelData = {
      media_properties: {
        source_sid: recordingSid,
      },
      participants: [
        {
          user_id: options.customerId || "customer",
          channel_participant: 1,
          full_name: options.customerName || "Customer",
        },
        {
          user_id: options.agentId || "agent",
          channel_participant: 2,
          full_name: options.agentName || "Agent",
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
 * @param {Object} options - Optional configuration
 * @param {string} options.callDirection - Call direction ('inbound' or 'outbound')
 * @returns {Promise<Object>} Transcript with sentences
 */
async function getTranscript(transcriptSid, options = {}) {
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

        // Log raw sentences for debugging - include ALL fields to understand what Twilio returns
        const rawSample = sentencesResponse.sentences?.slice(0, 5);
        console.log("Twilio Intelligence raw sentences structure:", JSON.stringify(rawSample, null, 2));

        // Also log unique participant values to understand the data
        const uniqueParticipants = [...new Set(sentencesResponse.sentences?.map(s => JSON.stringify({
          participant: s.participant,
          media_channel: s.media_channel,
          participant_role: s.participant_role,
          channel: s.channel
        })) || [])];
        console.log("Twilio Intelligence unique participant values:", uniqueParticipants);

        sentences = (sentencesResponse.sentences || []).map(s => ({
          participantId: s.participant,
          participantRole: s.participant_role, // Twilio may return this
          mediaChannel: s.media_channel, // This might indicate channel 1 or 2
          text: s.transcript,
          startTime: s.start_time,
          endTime: s.end_time,
          confidence: s.confidence,
        }));

        // Determine speaker based on multiple possible fields from Twilio
        //
        // IMPORTANT: For Voice SDK (web dialer) dual-channel recordings:
        // - Channel 1 = PSTN/Remote party (Customer on the phone)
        // - Channel 2 = WebRTC/Local party (Agent using browser dialer)
        //
        // This is counter-intuitive but consistent with how Twilio routes audio
        // for Voice SDK calls with <Dial record="record-from-answer-dual">.
        //
        const callDirection = options.callDirection || 'outbound';
        console.log(`Twilio Intelligence: Mapping channels for ${callDirection} call`);

        const getSpeakerLabel = (sentence) => {
          // First check media_channel which is the most reliable indicator
          const mediaChannel = sentence.mediaChannel || sentence.media_channel;

          if (mediaChannel !== undefined && mediaChannel !== null) {
            // For dual-channel recordings from Twilio Voice SDK with <Dial record="record-from-answer-dual">:
            // Channel 1 = PSTN/Remote party (Customer)
            // Channel 2 = WebRTC/Local party (Agent)
            // This matches our participant configuration in createTranscript()
            const channelNum = typeof mediaChannel === 'string' ? parseInt(mediaChannel, 10) : mediaChannel;
            return channelNum === 1 ? "Customer" : "Agent";
          }

          // Fallback to participant_role if available
          if (sentence.participantRole) {
            return sentence.participantRole.toLowerCase().includes("agent") ? "Agent" : "Customer";
          }

          // Fallback to participant field - this should be our user_id values ("agent" or "customer")
          const participant = sentence.participantId;
          if (typeof participant === "string") {
            // Check for our participant naming convention
            if (participant.toLowerCase().includes("agent")) {
              return "Agent";
            }
            if (participant.toLowerCase().includes("customer")) {
              return "Customer";
            }
            // If it's a number string, use the corrected mapping
            if (participant === "1") return "Customer";
            if (participant === "2") return "Agent";
          }
          if (typeof participant === "number") {
            // Channel 1 = Customer, Channel 2 = Agent (for Voice SDK)
            return participant === 1 ? "Customer" : "Agent";
          }

          return "Unknown";
        };

        // Combine all sentences into full text with speaker labels
        fullText = sentences
          .map(s => `[${getSpeakerLabel(s)}]: ${s.text}`)
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

    console.log(`Twilio Intelligence: Saved transcriptSid ${result.transcriptSid} to call ${callDoc.twilioCallSid} (recordingSid: ${callDoc.recordingSid})`);

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

  // Log full webhook data for debugging
  console.log("Twilio Intelligence webhook full payload:", JSON.stringify(webhookData, null, 2));

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

  // If not found by transcriptSid, try to get transcript details and find by recording SID
  if (!callDoc) {
    console.log(`Twilio Intelligence: No call found by transcriptSid, attempting to fetch transcript details...`);

    try {
      // Fetch transcript to get the source recording SID
      const transcriptDetails = await twilioIntelligenceRequest("GET", `Transcripts/${transcriptSid}`);
      console.log("Transcript details:", JSON.stringify(transcriptDetails, null, 2));

      // The channel contains media_properties with source_sid (recording SID)
      const channel = transcriptDetails.channel;
      let recordingSid = null;

      if (channel) {
        // Channel can be a JSON string or object
        const channelData = typeof channel === "string" ? JSON.parse(channel) : channel;
        recordingSid = channelData?.media_properties?.source_sid;
      }

      if (recordingSid) {
        console.log(`Twilio Intelligence: Looking up call by recordingSid=${recordingSid}`);
        callDoc = await Call.findOne({ recordingSid: recordingSid });

        if (callDoc) {
          console.log(`Twilio Intelligence: Found call ${callDoc.twilioCallSid} by recordingSid`);
          // Update the transcriptSid in the call record since we found it by recording
          if (!callDoc.twilioTranscript) {
            callDoc.twilioTranscript = {};
          }
          callDoc.twilioTranscript.transcriptSid = transcriptSid;
        }
      }
    } catch (fetchError) {
      console.error("Failed to fetch transcript details for lookup:", fetchError.message);
    }
  }

  if (!callDoc) {
    // List recent calls with pending/processing transcripts for debugging
    const recentCalls = await Call.find({
      "twilioTranscript.status": { $in: ["pending", "processing"] }
    }).select("twilioCallSid recordingSid twilioTranscript").limit(5);

    console.warn(`Twilio Intelligence webhook: No call found for TranscriptSid=${transcriptSid}`);
    console.log("Recent calls with pending transcripts:", JSON.stringify(recentCalls, null, 2));
    return null;
  }

  // Check event type - "voice_intelligence_transcript_available" means completed
  const isCompleted = eventType === "voice_intelligence_transcript_available";
  const isFailed = eventType === "voice_intelligence_transcript_failed";

  if (isCompleted) {
    // Fetch the full transcript, passing call direction for proper channel mapping
    const transcriptData = await getTranscript(transcriptSid, {
      callDirection: callDoc.direction || 'outbound',
    });

    // Debug: Log the transcript data to understand speaker labeling
    console.log(`Twilio Intelligence: Call direction=${callDoc.direction}, fullText preview:`, transcriptData.fullText?.substring(0, 500));
    if (transcriptData.sentences?.length > 0) {
      console.log(`Twilio Intelligence: Sample sentence data:`, JSON.stringify(transcriptData.sentences.slice(0, 2), null, 2));
    }

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

        // Auto-generate tags after summary is created
        try {
          const { generateCallTags } = require("./openaiService");
          const tags = await generateCallTags(
            transcriptData.fullText,
            summaryText,
            {
              direction: callDoc.direction,
              businessName: callDoc.businessName,
            }
          );

          if (tags && tags.length > 0) {
            // Initialize aiTags array if it doesn't exist
            if (!callDoc.aiTags) {
              callDoc.aiTags = [];
            }
            // Merge with existing tags (avoid duplicates)
            const existingTags = callDoc.aiTags.map(t => t.toLowerCase());
            const newTags = tags.filter(t => !existingTags.includes(t.toLowerCase()));
            callDoc.aiTags = [...callDoc.aiTags, ...newTags];
            await callDoc.save();

            console.log(`Twilio Intelligence: Auto-generated ${newTags.length} AI tags for call ${callDoc.twilioCallSid}: ${newTags.join(', ')}`);
          }
        } catch (tagError) {
          // Don't fail the whole process if tag generation fails
          console.error("Twilio Intelligence: Auto tag generation error (non-fatal):", tagError.message);
        }
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
