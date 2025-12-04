const mongoose = require('mongoose');
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

const dealerOfferSchema = new mongoose.Schema({
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  userResponseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserResponse',
    required: true,
    index: true
  },

  uniqueId: {
    type: String,
    required: true,
    index: true
  },

  // Dealer's internal status that does NOT affect the main offer status
  internalStatus: {
    type: String,
    default: 'new'
  },

  // Audit for internal status changes
  internalStatusUpdatedAt: {
    type: Date
  },
  internalStatusUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  internalStatusUpdatedByEmail: String,
  internalStatusUpdatedByName: String,

  // History of all internal status changes
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedByEmail: String,
    changedByName: String
  }],

  // Free-form notes that dealer can maintain internally
  notes: [{
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdByEmail: String,
    createdByName: String
  }]
}, {
  timestamps: true
});

dealerOfferSchema.index({ dealerId: 1, userResponseId: 1 }, { unique: true });

// Apply audit version plugin
dealerOfferSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model('DealerOffer', dealerOfferSchema);


