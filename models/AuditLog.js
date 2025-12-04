const mongoose = require('mongoose');

/**
 * AuditLog Model
 * 
 * Stores version history for all models in a single collection.
 * Each entry represents a snapshot of a document at a specific version.
 */
const auditLogSchema = new mongoose.Schema({
  // Which model this audit entry belongs to (e.g., 'User', 'Order', 'DealerOffer')
  modelName: {
    type: String,
    required: true,
    index: true
  },

  // Reference to the original document's _id
  refId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // Version number for this document (starts at 1, increments per change)
  version: {
    type: Number,
    required: true,
    min: 1
  },

  // Action that triggered this audit entry
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete']
  },

  // Full snapshot of the document at this version
  // For delete actions, this contains the last known state before deletion
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // When this change occurred
  changedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },

  // Who made this change (reference to User model)
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  // API endpoint that triggered this change
  apiUrl: {
    type: String,
    default: null
  },

  // Request payload/body that triggered this change
  requestPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // What fields changed (diff between previous and current state)
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: false, // We use changedAt instead
  collection: 'auditlogs' // Explicit collection name
});

// Compound index for efficient queries: modelName + refId + version
auditLogSchema.index({ modelName: 1, refId: 1, version: 1 }, { unique: true });

// Index for time-based queries
auditLogSchema.index({ changedAt: -1 });

// Index for querying by model and refId (for getHistory)
auditLogSchema.index({ modelName: 1, refId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

