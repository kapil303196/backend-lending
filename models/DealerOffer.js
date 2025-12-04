const mongoose = require('mongoose');

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

module.exports = mongoose.model('DealerOffer', dealerOfferSchema);


