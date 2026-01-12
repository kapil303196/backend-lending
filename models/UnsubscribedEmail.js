const mongoose = require('mongoose');

const unsubscribedEmailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
  },
  unsubscribedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
unsubscribedEmailSchema.index({ email: 1 });
unsubscribedEmailSchema.index({ unsubscribedAt: -1 });

module.exports = mongoose.model('UnsubscribedEmail', unsubscribedEmailSchema);
