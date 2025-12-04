const { AsyncLocalStorage } = require('async_hooks');

/**
 * AuditContext
 * 
 * Uses Node's AsyncLocalStorage to maintain audit context (current user)
 * throughout the lifetime of a request without explicitly passing it around.
 * 
 * Usage:
 *   - Call setAuditUser(userId) at the start of a request (in middleware)
 *   - Call getAuditUser() anywhere in the request chain to get the current user
 *   - The context is automatically cleaned up when the request completes
 */

const auditStorage = new AsyncLocalStorage();

/**
 * Set the current user for audit logging
 * @param {string|ObjectId|null} userIdOrEmail - User identifier (ID, email, or null for system)
 */
function setAuditUser(userIdOrEmail) {
  const store = auditStorage.getStore();
  if (store) {
    store.currentUser = userIdOrEmail || 'system';
  } else {
    // If no store exists, create one (shouldn't happen in normal flow)
    auditStorage.enterWith({ 
      currentUser: userIdOrEmail || 'system',
      apiUrl: null,
      requestPayload: null
    });
  }
}

/**
 * Set request information for audit logging
 * @param {string} apiUrl - API endpoint URL
 * @param {object} requestPayload - Request body/payload
 */
function setAuditRequestInfo(apiUrl, requestPayload) {
  const store = auditStorage.getStore();
  if (store) {
    store.apiUrl = apiUrl;
    store.requestPayload = requestPayload;
  }
}

/**
 * Get request information for audit logging
 * @returns {object} Object with apiUrl and requestPayload
 */
function getAuditRequestInfo() {
  const store = auditStorage.getStore();
  return store ? {
    apiUrl: store.apiUrl || null,
    requestPayload: store.requestPayload || null
  } : { apiUrl: null, requestPayload: null };
}

/**
 * Get the current user for audit logging
 * @returns {string|ObjectId|'system'|null} Current user identifier or 'system' if not set
 */
function getAuditUser() {
  const store = auditStorage.getStore();
  return store ? (store.currentUser || 'system') : 'system';
}

/**
 * Run a function within an audit context
 * This is useful for wrapping request handlers or async operations
 * 
 * @param {string|ObjectId|null} userIdOrEmail - User identifier
 * @param {Function} fn - Function to run within the context
 * @returns {Promise} Result of the function
 */
function runWithAuditContext(userIdOrEmail, fn) {
  return auditStorage.run({ currentUser: userIdOrEmail || 'system' }, fn);
}

module.exports = {
  setAuditUser,
  getAuditUser,
  setAuditRequestInfo,
  getAuditRequestInfo,
  runWithAuditContext,
  auditStorage
};

