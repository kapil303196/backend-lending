# Audit Version Plugin - Usage Guide

## Quick Start

### 1. Apply Plugin to Your Models

```javascript
// models/User.js
const mongoose = require('mongoose');
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

const userSchema = new mongoose.Schema({
  email: String,
  name: String,
  // ... other fields
});

// Apply the plugin
userSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model('User', userSchema);
```

```javascript
// models/DealerOffer.js
const mongoose = require('mongoose');
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

const dealerOfferSchema = new mongoose.Schema({
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userResponseId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserResponse' },
  internalStatus: String,
  // ... other fields
});

// Apply the plugin
dealerOfferSchema.plugin(auditVersionPlugin);

module.exports = mongoose.model('DealerOffer', dealerOfferSchema);
```

### 2. Set Up Middleware in Express

```javascript
// server.js or app.js
const express = require('express');
const { auditMiddleware } = require('./middleware/auditMiddleware');
const { authenticate } = require('./middleware/auth'); // Your existing auth middleware

const app = express();

// Apply audit middleware AFTER authentication middleware
// This ensures req.user is available
app.use(authenticate); // Your existing auth middleware
app.use(auditMiddleware); // Audit middleware

// ... rest of your routes
```

### 3. Use Models Normally

The plugin automatically tracks all changes:

```javascript
// Create - automatically logged
const user = new User({ email: 'test@example.com', name: 'Test User' });
await user.save(); // Creates audit log entry with action: 'create', version: 1

// Update - automatically logged
user.name = 'Updated Name';
await user.save(); // Creates audit log entry with action: 'update', version: 2

// Update via findOneAndUpdate - automatically logged
await User.findOneAndUpdate(
  { email: 'test@example.com' },
  { name: 'Another Name' }
); // Creates audit log entry with action: 'update', version: 3

// Delete - automatically logged
await User.findByIdAndDelete(user._id); // Creates audit log entry with action: 'delete', version: 4
```

### 4. Query History

```javascript
// Get full history for a document
const history = await User.getHistory(userId);
// Returns: [{ version: 1, action: 'create', data: {...}, ... }, ...]

// Get a specific version
const version2 = await User.getVersion(userId, 2);
// Returns: { version: 2, action: 'update', data: {...}, ... }

// Get latest version
const latest = await User.getLatestVersion(userId);
// Returns: { version: 4, action: 'delete', data: {...}, ... }
```

## Applying to Existing Models

### Manual Application (Recommended)

Go through each model file and add:

```javascript
const auditVersionPlugin = require('../plugins/auditVersionPlugin');
// ... schema definition ...
schema.plugin(auditVersionPlugin);
```

### Batch Application Script

Create a script to apply to all models:

```javascript
// scripts/applyAuditPlugin.js
const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');
const files = fs.readdirSync(modelsDir);

files.forEach(file => {
  if (file.endsWith('.js') && file !== 'AuditLog.js') {
    const filePath = path.join(modelsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if plugin is already applied
    if (content.includes('auditVersionPlugin')) {
      console.log(`✓ ${file} already has audit plugin`);
      return;
    }
    
    // Add import at the top (after mongoose require)
    if (content.includes("require('mongoose')")) {
      content = content.replace(
        /(const mongoose = require\('mongoose'\);)/,
        "$1\nconst auditVersionPlugin = require('../plugins/auditVersionPlugin');"
      );
    }
    
    // Add plugin before module.exports
    if (content.includes('module.exports')) {
      content = content.replace(
        /(module\.exports = mongoose\.model)/,
        "schema.plugin(auditVersionPlugin);\n\n$1"
      );
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`✓ Applied audit plugin to ${file}`);
  }
});

console.log('Done!');
```

Run: `node scripts/applyAuditPlugin.js`

**Note:** Review the changes before committing, as the script makes assumptions about your code structure.

## Advanced Usage

### Manual Audit Context (for scripts, background jobs, etc.)

```javascript
const { runWithAuditContext } = require('./utils/auditContext');
const User = require('./models/User');

// Run operations with a specific user context
await runWithAuditContext('admin@example.com', async () => {
  const user = await User.findById(userId);
  user.name = 'Updated by Admin';
  await user.save(); // Audit log will show changedBy: 'admin@example.com'
});
```

### Query Audit Logs Directly

```javascript
const AuditLog = require('./models/AuditLog');

// Get all audit logs for a specific model
const allUserLogs = await AuditLog.find({ modelName: 'User' })
  .sort({ changedAt: -1 })
  .limit(100);

// Get all changes by a specific user
const userChanges = await AuditLog.find({ changedBy: 'user@example.com' })
  .sort({ changedAt: -1 });

// Get all deletes across all models
const allDeletes = await AuditLog.find({ action: 'delete' })
  .sort({ changedAt: -1 });
```

## Important Notes

1. **Version Field**: The plugin adds a `version` field to your documents. Existing documents will have `version: 0` until they're updated.

2. **Performance**: Audit logging is asynchronous and won't block your main operations. Errors in audit logging are caught and logged but don't fail the main operation.

3. **Storage**: Each change creates a full snapshot. For large documents with frequent changes, consider archiving old audit logs periodically.

4. **Indexes**: The AuditLog model has indexes on `{modelName, refId, version}` and `{changedAt}` for efficient queries.

5. **Context**: The audit context uses AsyncLocalStorage, which works with async/await. If you use callbacks, wrap them with `runWithAuditContext`.

## Troubleshooting

### Audit logs not being created

1. Check that the plugin is applied: `schema.plugin(auditVersionPlugin)`
2. Check that middleware is set up: `app.use(auditMiddleware)`
3. Check console for error messages (audit errors are logged but don't throw)

### changedBy is always 'system'

1. Ensure `auditMiddleware` runs AFTER your authentication middleware
2. Check that `req.user` is set by your auth middleware
3. Verify the middleware order in your Express app

### Version not incrementing

1. Check that the document has the version field (should be added automatically)
2. Ensure you're using Mongoose methods (save, findOneAndUpdate, etc.) not raw MongoDB operations

