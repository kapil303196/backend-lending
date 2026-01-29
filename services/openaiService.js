// Treat OpenAI as untyped to avoid TS/JS interop issues with the v4 SDK
/** @type {any} */
const OpenAI = require("openai");
// Treat axios as untyped here to avoid module typing issues
/** @type {any} */
const axios = require("axios");
const FormData = require("form-data");
const AdminConfig = require("../models/AdminConfig");

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
 * @param {string} audioUrl - URL of the audio file
 * @returns {Promise<Buffer>} Audio file buffer
 */
async function downloadAudio(audioUrl) {
  try {
    const response = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 60000, // 60 second timeout
      maxContentLength: 100 * 1024 * 1024, // 100MB max
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Error downloading audio:", error.message);
    throw new Error(`Failed to download audio: ${error.message}`);
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

module.exports = {
  getOpenAIConfig,
  createOpenAIClient,
  transcribeAudio,
  summarizeTranscription,
  processCallRecording,
};
