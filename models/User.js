const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  name: {
    type: String,
    default: ''
  },
  
  role: {
    type: String,
    enum: ['admin', 'user', 'dealer'],
    default: 'admin'
  },
  
  // Reference to their applications/responses (can have multiple)
  userResponseIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserResponse'
  }],
  
  // Business information (from application)
  businessName: {
    type: String,
    default: ''
  },
  
  phone: {
    type: String,
    default: ''
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Track if this is their first login (to prompt password change)
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  
  lastLogin: {
    type: Date
  }
  
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Method to update last login
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  await this.save();
};

// Remove password from JSON response
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Apply audit version plugin
userSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model('User', userSchema);

