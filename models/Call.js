const mongoose = require("mongoose");
const auditVersionPlugin = require("../plugins/auditVersionPlugin");

const callSchema = new mongoose.Schema(
  {
    // Twilio identifiers
    twilioCallSid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    parentCallSid: {
      type: String,
      index: true,
    },

    // Direction and basic info
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
      index: true,
    },
    fromNumber: {
      type: String,
      required: true,
      index: true,
    },
    toNumber: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      index: true,
    },

    // Timing
    startTime: Date,
    endTime: Date,
    durationSeconds: Number,

    // Recording info
    recordingSid: {
      type: String,
      index: true,
    },
    recordingUrl: String,
    recordingDurationSeconds: Number,

    // Transcription and AI summary
    transcription: {
      text: String,
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed"],
        default: "pending",
      },
      processedAt: Date,
      error: String,
      source: {
        type: String,
        enum: ["openai-whisper", "twilio-intelligence", "twilio-record"],
        default: "openai-whisper",
      },
    },

    // Twilio Intelligence transcript info
    twilioTranscript: {
      transcriptSid: String,
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed"],
      },
      requestedAt: Date,
      completedAt: Date,
      duration: Number,
      error: String,
    },
    summary: {
      text: String,
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed"],
        default: "pending",
      },
      processedAt: Date,
      error: String,
      model: String, // OpenAI model used
    },

    // Associations
    mcaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MCA",
    },
    userResponseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserResponse",
    },
    businessName: String,

    // Agent / extension handling
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    agentExtension: String,

    // Raw webhook payload snapshots for debugging
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

callSchema.index({ createdAt: -1 });
callSchema.index({ mcaId: 1, createdAt: -1 });
callSchema.index({ agentId: 1, createdAt: -1 });
callSchema.index({ status: 1, createdAt: -1 });

callSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model("Call", callSchema);

