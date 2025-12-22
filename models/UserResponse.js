const mongoose = require("mongoose");
const auditVersionPlugin = require("../plugins/auditVersionPlugin");

const userResponseSchema = new mongoose.Schema(
  {
    // Reference to the MCA record
    mcaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MCA",
      required: true,
      index: true,
    },

    // Store the uniqueId for easier reference
    uniqueId: {
      type: String,
      required: true,
      index: true,
    },

    // User verification status
    isVerified: {
      type: Boolean,
      default: false,
    },

    // User comments/feedback
    comments: {
      type: String,
      default: "",
    },

    // Form data submitted by user - stored as flexible object
    formData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Verification fields - user confirms data is correct
    verifiedFields: [
      {
        fieldName: String,
        isCorrect: Boolean,
        correctedValue: String,
        note: String,
      },
    ],

    // User contact information (if collected)
    userContact: {
      name: String,
      email: String,
      phone: String,
    },

    // IP address for audit trail
    ipAddress: String,

    // User agent for audit trail
    userAgent: String,

    // Submission status
    status: {
      type: String,
      enum: ["pending", "submitted", "approved", "rejected"],
      default: "pending",
    },

    // Soft delete flag
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // When the form was submitted
    submittedAt: {
      type: Date,
    },

    // Bank statement files uploaded to S3
    bankStatements: [
      {
        url: String, // S3 URL
        key: String, // S3 key for deletion
        originalName: String, // Original file name
        size: Number, // File size in bytes
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
userResponseSchema.index({ mcaId: 1, createdAt: -1 });
userResponseSchema.index({ uniqueId: 1 });
userResponseSchema.index({ status: 1 });

// Pre-save middleware to set submittedAt on first submission
userResponseSchema.pre("save", async function () {
  if (this.status === "submitted" && !this.submittedAt) {
    this.submittedAt = new Date();
  }
});

// Apply audit version plugin
userResponseSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model("UserResponse", userResponseSchema);
