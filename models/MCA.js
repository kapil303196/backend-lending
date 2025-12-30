const mongoose = require('mongoose');
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

const mcaSchema = new mongoose.Schema({
  // Unique identifier for sharing with users
  uniqueId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Soft delete flag
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Reference to user responses
  userResponses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserResponse'
  }],
  
  // Dynamic fields from Excel data - all stored as strings
  // The import script will add fields dynamically based on the Excel columns
  
}, {
  timestamps: true,
  strict: false, // Allow dynamic fields from Excel
  collection: 'MCA' // Explicitly specify collection name to match existing MongoDB collection
});

// Index for efficient queries
mcaSchema.index({ uniqueId: 1, isActive: 1 });
mcaSchema.index({ createdAt: -1 });

// Static method to find by MongoDB ID or uniqueId
mcaSchema.statics.findByIdOrUniqueId = async function(identifier) {
  let doc;
  
  // Try to find by uniqueId first
  doc = await this.findOne({ uniqueId: identifier }).populate('userResponses');
  if (doc) return doc;
  
  // If not found and identifier is a valid ObjectId, try MongoDB _id
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    doc = await this.findById(identifier).populate('userResponses');
    return doc;
  }
  
  return null;
};

// Instance method for soft delete
mcaSchema.methods.softDelete = function() {
  this.isActive = false;
  return this.save();
};

// Instance method to restore
mcaSchema.methods.restore = function() {
  this.isActive = true;
  return this.save();
};

// Query helper to filter only active records
mcaSchema.query.active = function() {
  return this.where({ isActive: true });
};

// Pre-find middleware to exclude soft-deleted by default
// Comment this out if you want to include soft-deleted records by default
// mcaSchema.pre(/^find/, function() {
//   if (!this.getQuery().isActive) {
//     this.where({ isActive: true });
//   }
// });

// Apply audit version plugin
mcaSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model('MCA', mcaSchema);

