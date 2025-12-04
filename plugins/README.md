# Audit & Versioning System

A complete audit and versioning system for Mongoose models that automatically tracks all changes to documents.

## Files Created

1. **`models/AuditLog.js`** - The audit log model (stores all versions)
2. **`plugins/auditVersionPlugin.js`** - The Mongoose plugin (applies to schemas)
3. **`utils/auditContext.js`** - AsyncLocalStorage context helper (tracks current user)
4. **`middleware/auditMiddleware.js`** - Express middleware (sets user context)

## Quick Setup

### Step 1: Apply Plugin to Models

Add to any model file:

```javascript
const auditVersionPlugin = require('../plugins/auditVersionPlugin');

// ... schema definition ...

schema.plugin(auditVersionPlugin);
```

### Step 2: Add Middleware to Express

In `server.js` (after your auth middleware):

```javascript
const { auditMiddleware } = require('./middleware/auditMiddleware');

app.use(authenticate); // Your existing auth
app.use(auditMiddleware); // Add this
```

### Step 3: Use Models Normally

The plugin automatically tracks all changes:

```javascript
// Create
const user = new User({ email: 'test@example.com' });
await user.save(); // Creates audit log automatically

// Update
user.name = 'New Name';
await user.save(); // Creates audit log automatically

// Delete
await User.findByIdAndDelete(userId); // Creates audit log automatically
```

### Step 4: Query History

```javascript
// Get full history
const history = await User.getHistory(userId);

// Get specific version
const version = await User.getVersion(userId, 2);

// Get latest version
const latest = await User.getLatestVersion(userId);
```

## Features

✅ **Automatic Tracking** - No manual logging needed  
✅ **Full Snapshots** - Complete document state at each version  
✅ **User Tracking** - Records who made each change  
✅ **Single Collection** - All models use `audit_logs` collection  
✅ **Version Numbers** - Incrementing version per document  
✅ **Query Helpers** - Easy history retrieval methods  
✅ **Non-Blocking** - Audit failures don't break main operations  

## Documentation

- **`USAGE_EXAMPLES.md`** - Detailed usage guide
- **`EXAMPLE_APPLICATION.js`** - Before/after code examples

## Next Steps

1. Apply plugin to your models (see `EXAMPLE_APPLICATION.js`)
2. Add middleware to `server.js`
3. Test with a simple create/update/delete operation
4. Query history to verify it's working

## Support

All audit operations are logged to console on error but won't throw exceptions. Check console logs if audit entries aren't being created.

