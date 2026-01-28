const mongoose = require('mongoose');
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

const adminConfigSchema = new mongoose.Schema(
  {
    // Singleton identifier
    configId: { type: String, default: "default", unique: true },

    // Page Visibility
    pages: {
      overview: { type: Boolean, default: true },
      applications: { type: Boolean, default: true },
    },

    // Overview Page Charts
    charts: {
      statusDistribution: { type: Boolean, default: true }, // Doughnut
      fundingTrend: { type: Boolean, default: true }, // Line chart
      amountDistribution: { type: Boolean, default: true }, // Bar chart
      revenueVsLending: { type: Boolean, default: true }, // Pie chart
    },

    // Application List Filters
    filters: {
      search: { type: Boolean, default: true },
      statusDropdown: { type: Boolean, default: true },
      sorting: { type: Boolean, default: true },
    },

    // Functional Permissions
    features: {
      allowStatusUpdate: { type: Boolean, default: true },
      viewSensitiveInfo: { type: Boolean, default: true }, // e.g. SSN, DOB
    },

    // Twilio + call center configuration (editable from admin panel)
    twilio: {
      accountSid: { type: String, default: "" },
      authToken: { type: String, default: "" },
      apiKey: { type: String, default: "" },
      apiSecret: { type: String, default: "" },
      primaryNumber: { type: String, default: "" }, // Main business number
      outboundCallerId: { type: String, default: "" }, // Caller ID for outbound calls

      // Recording behaviour toggles
      recordings: {
        enabled: { type: Boolean, default: true },
        recordInbound: { type: Boolean, default: true },
        recordOutbound: { type: Boolean, default: true },
      },

      // Optional shared secret used to validate webhook requests (in addition to Twilio signatures)
      webhookSecret: { type: String, default: "" },
    },

    // Outbound dialer configuration
    dialer: {
      // Default dial method: "direct", "softphone", "ghl", "deskphone", "ivr"
      defaultMethod: { type: String, default: "direct", enum: ["direct", "softphone", "ghl", "deskphone", "ivr"] },
      
      // GoHighLevel integration
      ghl: {
        enabled: { type: Boolean, default: false },
        apiKey: { type: String, default: "" },
        locationId: { type: String, default: "" },
        webhookUrl: { type: String, default: "" },
      },
      
      // Softphone configuration (Twilio Client SDK)
      softphone: {
        enabled: { type: Boolean, default: false },
        // Twilio Client SDK will be used from frontend
      },
      
      // Deskphone/SIP configuration
      deskphone: {
        enabled: { type: Boolean, default: false },
        sipDomain: { type: String, default: "" },
      },
    },

    // OpenAI configuration for transcription and summarization
    openai: {
      apiKey: { type: String, default: "" },
      enabled: { type: Boolean, default: false },
      autoTranscribe: { type: Boolean, default: true }, // Auto-transcribe completed calls
      autoSummarize: { type: Boolean, default: true }, // Auto-summarize transcriptions
      model: { type: String, default: "gpt-4o-mini" }, // Model for summarization
      transcriptionModel: { type: String, default: "whisper-1" }, // Whisper model
    },
  },
  { timestamps: true }
);

// Apply audit version plugin
adminConfigSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model('AdminConfig', adminConfigSchema);

