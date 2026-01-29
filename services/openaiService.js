// Treat OpenAI as untyped to avoid TS/JS interop issues with the v4 SDK
/** @type {any} */
const OpenAI = require("openai");
// Treat axios as untyped here to avoid module typing issues
/** @type {any} */
const axios = require("axios");
const FormData = require("form-data");
const AdminConfig = require("../models/AdminConfig");
const { getTwilioConfig } = require("../utils/twilioHelpers");

/**
 * Get OpenAI configuration from AdminConfig
 * @returns {Promise<Object>} OpenAI configuration
 * @throws {Error} If OpenAI is not configured
 */
async function getOpenAIConfig() {
  const config = await AdminConfig.findOne({ configId: "default" });
  if (!config?.openai?.apiKey || !config?.openai?.enabled) {
    throw new Error("OpenAI is not configured or disabled in admin panel");
  }
  return config.openai;
}

/**
 * Create OpenAI client instance
 * @returns {Promise<OpenAI>} OpenAI client
 * @throws {Error} If OpenAI is not configured
 */
async function createOpenAIClient() {
  const openaiConfig = await getOpenAIConfig();
  return new OpenAI({
    apiKey: openaiConfig.apiKey,
  });
}

/**
 * Download audio file from URL and return as buffer
 * Handles Twilio recording URLs that require authentication
 * @param {string} audioUrl - URL of the audio file
 * @returns {Promise<Buffer>} Audio file buffer
 */
async function downloadAudio(audioUrl) {
  try {
    // Check if this is a Twilio recording URL that needs authentication
    const isTwilioUrl = audioUrl.includes("api.twilio.com") || audioUrl.includes("twilio.com");

    let authConfig = {};
    if (isTwilioUrl) {
      // Get Twilio credentials for authentication
      const twilioConfig = await getTwilioConfig();
      authConfig = {
        auth: {
          username: twilioConfig.accountSid,
          password: twilioConfig.authToken,
        },
      };
    }

    const response = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 60000, // 60 second timeout
      maxContentLength: 100 * 1024 * 1024, // 100MB max
      ...authConfig,
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Error downloading audio:", error.message);
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

/**
 * Download Twilio recording with authentication
 * Used by the proxy endpoint to stream recordings to frontend
 * @param {string} recordingUrl - Twilio recording URL
 * @returns {Promise<{buffer: Buffer, contentType: string}>} Audio buffer and content type
 */
async function downloadTwilioRecording(recordingUrl) {
  try {
    const twilioConfig = await getTwilioConfig();

    const response = await axios.get(recordingUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
      auth: {
        username: twilioConfig.accountSid,
        password: twilioConfig.authToken,
      },
    });

    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers["content-type"] || "audio/mpeg",
    };
  } catch (error) {
    console.error("Error downloading Twilio recording:", error.message);
    throw new Error(`Failed to download recording: ${error.message}`);
  }
}

/**
 * Transcribe audio using OpenAI Whisper API
 * @param {string} recordingUrl - URL of the Twilio recording
 * @returns {Promise<string>} Transcribed text
 * @throws {Error} If transcription fails
 */
async function transcribeAudio(recordingUrl) {
  try {
    const openaiConfig = await getOpenAIConfig();

    // Download audio file
    const audioBuffer = await downloadAudio(recordingUrl);

    // Create FormData for OpenAI API
    const formData = new FormData();
    
    formData.append("file", audioBuffer, {
      filename: "recording.mp3",
      contentType: "audio/mpeg",
    });
    formData.append("model", openaiConfig.transcriptionModel || "whisper-1");
    formData.append("language", "en");
    formData.append("response_format", "text");

    // Use OpenAI's direct API call with FormData
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${openaiConfig.apiKey}`,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  } catch (error) {
    console.error("OpenAI transcription error:", error);
    throw new Error(
      `Transcription failed: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Generate summary of transcription using OpenAI GPT
 * @param {string} transcription - Transcribed text
 * @param {Object} callContext - Call context (direction, businessName, etc.)
 * @returns {Promise<string>} Summary text
 * @throws {Error} If summarization fails
 */
async function summarizeTranscription(transcription, callContext = {}) {
  try {
    const openaiConfig = await getOpenAIConfig();
    const client = await createOpenAIClient();

    const direction = callContext.direction || "call";
    const businessName = callContext.businessName
      ? `Business: ${callContext.businessName}`
      : "";
    const agentName = callContext.agentExtension
      ? `Agent Extension: ${callContext.agentExtension}`
      : "";

    const prompt = `You are a professional call center analyst. Summarize the following ${direction} call transcript in a clear, concise format.

${businessName ? `${businessName}\n` : ""}${agentName ? `${agentName}\n` : ""}

Call Transcript:
${transcription}

Please provide a summary that includes:
1. Key topics discussed
2. Important information shared
3. Action items or next steps (if any)
4. Overall call outcome

Summary:`;

    const completion = await client.chat.completions.create({
      model: openaiConfig.model || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional call center analyst. Summarize call transcripts clearly and concisely.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent summaries
      max_tokens: 500, // Limit summary length
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) {
      throw new Error("Empty summary returned from OpenAI");
    }

    return summary;
  } catch (error) {
    console.error("OpenAI summarization error:", error);
    throw new Error(
      `Summarization failed: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Process call recording: transcribe and summarize
 * This is the main function to call when a call recording is ready
 * @param {Object} callDoc - Call document from database
 * @returns {Promise<Object>} Object with transcription and summary
 */
async function processCallRecording(callDoc) {
  const result = {
    transcription: null,
    summary: null,
    errors: [],
  };

  try {
    // Check if OpenAI is enabled
    const openaiConfig = await getOpenAIConfig();
    if (!openaiConfig.enabled) {
      throw new Error("OpenAI is disabled in admin panel");
    }

    // Check if recording URL exists
    if (!callDoc.recordingUrl) {
      throw new Error("No recording URL available for this call");
    }

    // Transcribe if auto-transcribe is enabled
    if (openaiConfig.autoTranscribe) {
      try {
        callDoc.transcription.status = "processing";
        callDoc.transcription.processedAt = new Date();
        await callDoc.save();

        const transcriptionText = await transcribeAudio(callDoc.recordingUrl);
        callDoc.transcription.text = transcriptionText;
        callDoc.transcription.status = "completed";
        callDoc.transcription.processedAt = new Date();
        await callDoc.save();

        result.transcription = transcriptionText;
      } catch (transcriptionError) {
        console.error("Transcription error:", transcriptionError);
        callDoc.transcription.status = "failed";
        callDoc.transcription.error = transcriptionError.message;
        callDoc.transcription.processedAt = new Date();
        await callDoc.save();
        result.errors.push(`Transcription: ${transcriptionError.message}`);
      }
    }

    // Summarize if auto-summarize is enabled and transcription succeeded
    if (
      openaiConfig.autoSummarize &&
      callDoc.transcription.status === "completed" &&
      callDoc.transcription.text
    ) {
      try {
        callDoc.summary.status = "processing";
        callDoc.summary.processedAt = new Date();
        await callDoc.save();

        const summaryText = await summarizeTranscription(
          callDoc.transcription.text,
          {
            direction: callDoc.direction,
            businessName: callDoc.businessName,
            agentExtension: callDoc.agentExtension,
          }
        );

        callDoc.summary.text = summaryText;
        callDoc.summary.status = "completed";
        callDoc.summary.processedAt = new Date();
        callDoc.summary.model = openaiConfig.model || "gpt-4o-mini";
        await callDoc.save();

        result.summary = summaryText;

        // Auto-generate tags after summary is created
        try {
          const tags = await generateCallTags(
            callDoc.transcription.text,
            summaryText,
            {
              direction: callDoc.direction,
              businessName: callDoc.businessName,
            }
          );

          if (tags && tags.length > 0) {
            // Initialize tags object if it doesn't exist
            if (!callDoc.tags) {
              callDoc.tags = { ai: [], custom: [] };
            }
            if (!callDoc.tags.ai) {
              callDoc.tags.ai = [];
            }
            // Merge with existing tags (avoid duplicates)
            const existingTags = callDoc.tags.ai.map(t => t.toLowerCase());
            const newTags = tags.filter(t => !existingTags.includes(t.toLowerCase()));
            callDoc.tags.ai = [...callDoc.tags.ai, ...newTags];
            callDoc.tags.aiGeneratedAt = new Date();
            await callDoc.save();

            console.log(`Auto-generated ${newTags.length} AI tags for call ${callDoc.twilioCallSid}: ${newTags.join(', ')}`);
            result.tags = callDoc.tags.ai;
          }
        } catch (tagError) {
          // Don't fail the whole process if tag generation fails
          console.error("Auto tag generation error (non-fatal):", tagError.message);
          result.errors.push(`Tags (non-fatal): ${tagError.message}`);
        }
      } catch (summaryError) {
        console.error("Summarization error:", summaryError);
        callDoc.summary.status = "failed";
        callDoc.summary.error = summaryError.message;
        callDoc.summary.processedAt = new Date();
        await callDoc.save();
        result.errors.push(`Summarization: ${summaryError.message}`);
      }
    }

    return result;
  } catch (error) {
    console.error("Process call recording error:", error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Generate AI tags for a call based on transcription and summary
 * @param {string} transcription - Transcribed text
 * @param {string} summary - Summary text (optional, but helpful)
 * @param {Object} callContext - Call context (direction, businessName, etc.)
 * @returns {Promise<string[]>} Array of tags
 * @throws {Error} If tag generation fails
 */
async function generateCallTags(transcription, summary = "", callContext = {}) {
  try {
    const openaiConfig = await getOpenAIConfig();
    const client = await createOpenAIClient();

    const direction = callContext.direction || "call";
    const businessName = callContext.businessName || "";

    // Combine transcription and summary for better context
    const content = summary
      ? `Summary: ${summary}\n\nTranscription: ${transcription}`
      : transcription;

    const prompt = `Analyze this ${direction} call and generate 3-6 short, relevant tags to categorize it.

${businessName ? `Business: ${businessName}\n` : ""}
Call Content:
${content}

Generate tags that describe:
- Call type (e.g., "inquiry", "complaint", "follow-up", "sales", "support")
- Topic discussed (e.g., "pricing", "account", "technical", "billing")
- Outcome (e.g., "resolved", "callback-needed", "escalated", "sale-closed")
- Sentiment (e.g., "positive", "negative", "neutral")

Return ONLY a JSON array of lowercase tag strings, no explanation. Example: ["inquiry", "pricing", "positive", "resolved"]`;

    const completion = await client.chat.completions.create({
      model: openaiConfig.model || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a call analysis assistant. Generate concise, relevant tags for categorizing calls. Return only a valid JSON array of tag strings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse JSON array from response
    try {
      const tags = JSON.parse(responseText);
      if (!Array.isArray(tags)) {
        throw new Error("Response is not an array");
      }
      // Ensure all tags are strings and lowercase
      return tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.toLowerCase().trim())
        .filter((tag) => tag.length > 0 && tag.length <= 30)
        .slice(0, 6); // Max 6 tags
    } catch (parseError) {
      console.error("Failed to parse tags JSON:", responseText);
      // Try to extract tags from text if JSON parsing fails
      const tagMatch = responseText.match(/\[(.*?)\]/s);
      if (tagMatch) {
        const tagStrings = tagMatch[1].match(/"([^"]+)"/g);
        if (tagStrings) {
          return tagStrings
            .map((t) => t.replace(/"/g, "").toLowerCase().trim())
            .filter((t) => t.length > 0 && t.length <= 30)
            .slice(0, 6);
        }
      }
      throw new Error("Failed to parse tags from response");
    }
  } catch (error) {
    console.error("OpenAI tag generation error:", error);
    throw new Error(`Tag generation failed: ${error.message || "Unknown error"}`);
  }
}

module.exports = {
  getOpenAIConfig,
  createOpenAIClient,
  transcribeAudio,
  summarizeTranscription,
  processCallRecording,
  downloadTwilioRecording,
  generateCallTags,
};
