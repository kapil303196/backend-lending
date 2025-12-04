/**
 * EXAMPLE: How to Apply Audit Plugin to Existing Models
 * 
 * This file shows before/after examples for applying the audit plugin.
 * DO NOT run this file - it's just for reference.
 */

// ============================================
// EXAMPLE 1: User Model
// ============================================

// BEFORE:
/*
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  // ... other fields
});

userSchema.pre('save', async function(next) {
  // existing password hashing logic
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model('User', userSchema);
*/

// AFTER:
/*
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const auditVersionPlugin = require('../plugins/auditVersionPlugin'); // ADD THIS

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  // ... other fields
});

userSchema.pre('save', async function(next) {
  // existing password hashing logic
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.plugin(auditVersionPlugin); // ADD THIS LINE

module.exports = mongoose.model('User', userSchema);
*/

// ============================================
// EXAMPLE 2: DealerOffer Model
// ============================================

// BEFORE:
/*
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
  internalStatus: {
    type: String,
    default: 'new'
  },
  // ... other fields
}, {
  timestamps: true
});

module.exports = mongoose.model('DealerOffer', dealerOfferSchema);
*/

// AFTER:
/*
const mongoose = require('mongoose');
const auditVersionPlugin = require('../plugins/auditVersionPlugin'); // ADD THIS

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
  internalStatus: {
    type: String,
    default: 'new'
  },
  // ... other fields
}, {
  timestamps: true
});

dealerOfferSchema.plugin(auditVersionPlugin); // ADD THIS LINE

module.exports = mongoose.model('DealerOffer', dealerOfferSchema);
*/

// ============================================
// EXAMPLE 3: Server.js Middleware Setup
// ============================================

// BEFORE:
/*
const express = require('express');
const { authenticate } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(authenticate);

// ... routes
*/

// AFTER:
/*
const express = require('express');
const { authenticate } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/auditMiddleware'); // ADD THIS

const app = express();

app.use(express.json());
app.use(authenticate);
app.use(auditMiddleware); // ADD THIS LINE (after authenticate)

// ... routes
*/

// ============================================
// QUICK REFERENCE CHECKLIST
// ============================================

/*
To apply audit plugin to a model:

1. Add import at top:
   const auditVersionPlugin = require('../plugins/auditVersionPlugin');

2. Add plugin before module.exports:
   schema.plugin(auditVersionPlugin);

3. In server.js, add middleware (after auth):
   const { auditMiddleware } = require('./middleware/auditMiddleware');
   app.use(auditMiddleware);

That's it! The plugin will automatically:
- Add version field to documents
- Track all create/update/delete operations
- Store full snapshots in audit_logs collection
- Record who made changes and when
*/

