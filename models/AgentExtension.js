const mongoose = require("mongoose");
const auditVersionPlugin = require("../plugins/auditVersionPlugin");

const agentExtensionSchema = new mongoose.Schema(
  {
    // Human friendly name, e.g. "John Smith"
    name: {
      type: String,
      required: true,
    },

    // 3–4 digit extension, e.g. "101"
    extension: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Where to forward calls (cell, desk phone, or SIP URI)
    forwardingNumber: {
      type: String,
      default: "",
    },

    // Optional link to existing admin user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Enable/disable this extension
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

agentExtensionSchema.index({ extension: 1, isActive: 1 });

agentExtensionSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model("AgentExtension", agentExtensionSchema);

