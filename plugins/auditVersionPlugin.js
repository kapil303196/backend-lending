const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { getAuditUser, getAuditRequestInfo } = require('../utils/auditContext');

/**
 * Calculate the difference between two objects
 * Returns an object showing what changed: { field: { old: value, new: value } }
 */
function calculateChanges(oldData, newData) {
  if (!oldData) {
    return null; // No previous state
  }

  const changes = {};

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  
  // Remove internal fields that change automatically
  allKeys.delete('version');
  allKeys.delete('__v');
  allKeys.delete('updatedAt');

  for (const key of allKeys) {
    const oldValue = oldData[key];
    const newValue = newData[key];

    // Deep comparison for objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = {
        old: oldValue,
        new: newValue
      };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

// Track documents that are currently being audited to prevent duplicate logs
// Key: `${modelName}:${docId}:${operationId}` - ensures one audit per operation
const pendingAudits = new Set();
let operationCounter = 0;

/**
 * Audit Version Plugin
 * 
 * Automatically tracks all changes to a Mongoose model:
 * - Adds a 'version' field to the schema (starts at 0, increments on changes)
 * - Creates audit log entries for create, update, and delete operations
 * - Provides static methods to query history
 * 
 * Usage:
 *   const userSchema = new mongoose.Schema({ ... });
 *   userSchema.plugin(auditVersionPlugin);
 */

function auditVersionPlugin(schema, options) {
  // Add version field to the schema
  schema.add({
    version: {
      type: Number,
      default: 0,
      required: true
    }
  });

  /**
   * Helper function to create an audit log entry (non-blocking, fire-and-forget)
   * This runs asynchronously after the response is sent to avoid blocking API calls
   */
  function createAuditLog(doc, action, modelName, operationId = null) {
    // Generate operation ID if not provided
    if (!operationId) {
      operationId = `op_${++operationCounter}_${Date.now()}`;
    }
    
    // Create unique key for this audit operation
    const auditKey = `${modelName}:${doc._id.toString()}:${operationId}`;
    
    // Check if we're already processing an audit for this document+operation
    if (pendingAudits.has(auditKey)) {
      return; // Already processing this audit, skip duplicate
    }
    
    // Mark this audit as pending
    pendingAudits.add(auditKey);
    
    // Capture context BEFORE setImmediate to preserve it
    const changedByRaw = getAuditUser();
    const requestInfo = getAuditRequestInfo();
    
    // Convert changedBy to ObjectId if it's a valid ObjectId string, otherwise null
    let changedBy = null;
    if (changedByRaw && changedByRaw !== 'system') {
      if (mongoose.Types.ObjectId.isValid(changedByRaw)) {
        changedBy = new mongoose.Types.ObjectId(changedByRaw);
      }
    }

    // Use setImmediate to defer execution until after the current event loop
    // This ensures the HTTP response is sent before audit logging happens
    setImmediate(async () => {
      try {
        // Prepare the snapshot data
        const docData = doc.toObject ? doc.toObject({ virtuals: false }) : doc;
        const snapshot = { ...docData };
        delete snapshot.version;
        delete snapshot.__v;

        // Get previous version to calculate changes
        let changes = null;
        let previousData = null;
        if (action === 'update') {
          const lastEntry = await AuditLog.findOne(
            { modelName, refId: doc._id },
            { data: 1, version: 1 },
            { sort: { version: -1 } }
          ).lean();
          
          if (lastEntry && lastEntry.data) {
            previousData = lastEntry.data;
            changes = calculateChanges(previousData, snapshot);
          }
        }

        // Always query audit log for latest version to avoid race conditions
        const lastEntry = await AuditLog.findOne(
          { modelName, refId: doc._id },
          { version: 1 },
          { sort: { version: -1 } }
        ).lean();
        
        let newVersion = lastEntry ? lastEntry.version + 1 : 1;

        // Retry logic for duplicate key errors (handles race conditions)
        let retries = 3;
        while (retries > 0) {
          try {
              const auditEntry = new AuditLog({
                modelName: modelName,
                refId: doc._id,
                version: newVersion,
                action: action,
                data: snapshot,
                changedAt: new Date(),
                changedBy: changedBy, // ObjectId reference or null
                apiUrl: requestInfo.apiUrl,
                requestPayload: requestInfo.requestPayload,
                changes: changes
              });

            await auditEntry.save();

            // Update document version atomically (only if not already updated)
            await mongoose.model(modelName).updateOne(
              { _id: doc._id, version: { $lt: newVersion } },
              { $set: { version: newVersion } }
            );

            // Clear the pending audit flag
            pendingAudits.delete(auditKey);
            return; // Success, exit retry loop
          } catch (error) {
            if (error.code === 11000 && retries > 1) {
              // Duplicate key error - version already exists, try next version
              newVersion++;
              retries--;
              continue;
            }
            throw error; // Re-throw if not a duplicate key or out of retries
          }
        }
      } catch (error) {
        // Log error but don't throw - audit failures should never break the main operation
        console.error(`[AuditPlugin] Failed to create audit log for ${modelName} (${action}):`, error.message);
      } finally {
        // Always clear the pending audit flag, even on error
        pendingAudits.delete(auditKey);
      }
    });
  }

  // Hook: save (covers both create and update)
  schema.pre('save', async function(next) {
    // For new documents, version starts at 0
    if (this.isNew && (this.version === undefined || this.version === null)) {
      this.version = 0;
    }
    // For existing documents, increment version if not already incremented
    else if (!this.isNew && this.isModified() && !this.isDirectModified('version')) {
      // Version will be incremented in the audit log creation
      // We'll update it there to avoid race conditions
    }

    next();
  });

  schema.post('save', function(doc) {
    // Non-blocking: create audit log asynchronously
    const action = doc.version === 0 ? 'create' : 'update';
    createAuditLog(doc, action, doc.constructor.modelName);
  });

  // Hook: findOneAndUpdate
  schema.pre(['findOneAndUpdate', 'findByIdAndUpdate'], async function() {
    // Set runValidators to ensure validation runs
    this.setOptions({ runValidators: true, new: true });
    // Mark this query so updateOne hook knows to skip
    this._isFindOneAndUpdate = true;
    // Create a unique operation ID for this update
    this._auditOperationId = `findOneAndUpdate_${++operationCounter}_${Date.now()}`;
  });

  schema.post(['findOneAndUpdate', 'findByIdAndUpdate'], function(doc) {
    if (!doc) return;

    // Capture context before async operation
    const model = this.model;
    const modelName = this.model.modelName;
    const docId = doc._id;
    const operationId = this._auditOperationId;

    // Non-blocking: create audit log asynchronously
    // Only log from findOneAndUpdate, not from updateOne
    setImmediate(async () => {
      try {
        const updatedDoc = await model.findById(docId);
        if (updatedDoc) {
          createAuditLog(updatedDoc, 'update', modelName, operationId);
        }
      } catch (error) {
        console.error(`[AuditPlugin] Post-findOneAndUpdate hook error:`, error);
      }
    });
  });

  // Hook: updateOne
  // Skip if this was triggered by findOneAndUpdate (which has its own hook)
  schema.post('updateOne', function() {
    // Skip if this was triggered by findOneAndUpdate
    if (this._isFindOneAndUpdate) {
      return;
    }
    
    // Uncomment below if you want to audit direct updateOne calls
    /*
    const query = this.getQuery();
    const docId = query._id || query.id;
    const model = this.model;
    const modelName = this.model.modelName;

    setImmediate(async () => {
      try {
        if (!docId) {
          const conditions = this.getQuery();
          const doc = await model.findOne(conditions);
          if (doc) {
            const updatedDoc = await model.findById(doc._id);
            if (updatedDoc) {
              createAuditLog(updatedDoc, 'update', modelName);
            }
          }
          return;
        }

        const updatedDoc = await model.findById(docId);
        if (updatedDoc) {
          createAuditLog(updatedDoc, 'update', modelName);
        }
      } catch (error) {
        console.error(`[AuditPlugin] Post-updateOne hook error:`, error);
      }
    });
    */
  });

  // Hook: deleteOne, findOneAndDelete, findByIdAndDelete
  schema.pre(['deleteOne', 'findOneAndDelete', 'findByIdAndDelete'], async function() {
    try {
      // Get the document before deletion to save its state
      const query = this.getQuery();
      const doc = await this.model.findOne(query);
      
      if (doc) {
        // Store the document in the query context so we can access it in post hook
        this._deletedDoc = doc;
      }
    } catch (error) {
      console.error(`[AuditPlugin] Pre-delete hook error:`, error);
    }
  });

  schema.post(['deleteOne', 'findOneAndDelete', 'findByIdAndDelete'], function(result) {
    // Non-blocking: create audit log asynchronously
    const deletedDoc = this._deletedDoc;
    const modelName = this.model.modelName;
    
    if (deletedDoc) {
      // Capture context before async operation
      const changedByRaw = getAuditUser();
      const requestInfo = getAuditRequestInfo();
      
      // Convert changedBy to ObjectId if it's a valid ObjectId string, otherwise null
      let changedBy = null;
      if (changedByRaw && changedByRaw !== 'system') {
        if (mongoose.Types.ObjectId.isValid(changedByRaw)) {
          changedBy = new mongoose.Types.ObjectId(changedByRaw);
        }
      }
      
      setImmediate(async () => {
        try {
          // Get latest version
          const lastEntry = await AuditLog.findOne(
            { modelName, refId: deletedDoc._id },
            { version: 1 },
            { sort: { version: -1 } }
          ).lean();
          
          let newVersion = lastEntry ? lastEntry.version + 1 : 1;

          const docData = deletedDoc.toObject ? deletedDoc.toObject() : deletedDoc;
          const snapshot = { ...docData };
          delete snapshot.version;
          delete snapshot.__v;

          // Retry logic for duplicate key errors
          let retries = 3;
          while (retries > 0) {
            try {
              const auditEntry = new AuditLog({
                modelName: modelName,
                refId: deletedDoc._id,
                version: newVersion,
                action: 'delete',
                data: snapshot,
                changedAt: new Date(),
                changedBy: changedBy, // ObjectId reference or null
                apiUrl: requestInfo.apiUrl,
                requestPayload: requestInfo.requestPayload,
                changes: null // No changes for delete
              });

              await auditEntry.save();
              return; // Success
            } catch (error) {
              if (error.code === 11000 && retries > 1) {
                newVersion++;
                retries--;
                continue;
              }
              throw error;
            }
          }
        } catch (error) {
          console.error(`[AuditPlugin] Post-delete hook error:`, error);
        }
      });
    }
  });

  /**
   * Static method: Get full history for a document
   * @param {ObjectId|String} refId - Document ID
   * @returns {Promise<Array>} Array of audit log entries ordered by version ascending
   */
  schema.statics.getHistory = async function(refId) {
    try {
      return await AuditLog.find({
        modelName: this.modelName,
        refId: refId
      })
        .populate('changedBy', 'email name role')
        .sort({ version: 1 })
        .lean();
    } catch (error) {
      console.error(`[AuditPlugin] getHistory error:`, error);
      throw error;
    }
  };

  /**
   * Static method: Get a specific version of a document
   * @param {ObjectId|String} refId - Document ID
   * @param {Number} versionNumber - Version number to retrieve
   * @returns {Promise<Object|null>} Audit log entry for that version, or null if not found
   */
  schema.statics.getVersion = async function(refId, versionNumber) {
    try {
      return await AuditLog.findOne({
        modelName: this.modelName,
        refId: refId,
        version: versionNumber
      })
        .populate('changedBy', 'email name role')
        .lean();
    } catch (error) {
      console.error(`[AuditPlugin] getVersion error:`, error);
      throw error;
    }
  };

  /**
   * Static method: Get the latest version of a document
   * @param {ObjectId|String} refId - Document ID
   * @returns {Promise<Object|null>} Latest audit log entry, or null if not found
   */
  schema.statics.getLatestVersion = async function(refId) {
    try {
      return await AuditLog.findOne({
        modelName: this.modelName,
        refId: refId
      })
        .populate('changedBy', 'email name role')
        .sort({ version: -1 })
        .lean();
    } catch (error) {
      console.error(`[AuditPlugin] getLatestVersion error:`, error);
      throw error;
    }
  };
}

module.exports = auditVersionPlugin;

