const { setAuditUser, setAuditRequestInfo, runWithAuditContext } = require('../utils/auditContext');

/**
 * Express Middleware: Set Audit User
 * 
 * Extracts the current user from the request (from req.user set by auth middleware)
 * and sets it in the audit context for automatic tracking in audit logs.
 * 
 * Usage:
 *   app.use(auditMiddleware);
 * 
 * Or apply to specific routes:
 *   router.use(auditMiddleware);
 * 
 * Assumes req.user exists (set by your authentication middleware).
 * If req.user doesn't exist, uses 'system' as the audit user.
 */
function auditMiddleware(req, res, next) {
  // Extract user identifier from req.user
  // Supports: req.user.id, req.user._id, req.user.email, or req.user itself
  let userId = null;

  if (req.user) {
    if (req.user.id) {
      userId = req.user.id.toString();
    } else if (req.user._id) {
      userId = req.user._id.toString();
    } else if (req.user.email) {
      userId = req.user.email;
    } else if (typeof req.user === 'string') {
      userId = req.user;
    } else {
      // Fallback: try to stringify the user object
      userId = JSON.stringify(req.user);
    }
  }

  // Set the audit user for this request
  setAuditUser(userId);

  // Set request information (URL and payload) for audit logging
  const apiUrl = `${req.method} ${req.originalUrl || req.url}`;
  const requestPayload = req.body && Object.keys(req.body).length > 0 ? req.body : null;
  setAuditRequestInfo(apiUrl, requestPayload);

  next();
}

/**
 * Wrapper function for async route handlers to ensure audit context is maintained
 * 
 * Usage:
 *   router.get('/users', auditWrapper(async (req, res) => {
 *     // Your route handler
 *   }));
 */
function auditWrapper(fn) {
  return (req, res, next) => {
    let userId = null;

    if (req.user) {
      if (req.user.id) {
        userId = req.user.id.toString();
      } else if (req.user._id) {
        userId = req.user._id.toString();
      } else if (req.user.email) {
        userId = req.user.email;
      }
    }

    runWithAuditContext(userId, () => {
      return Promise.resolve(fn(req, res, next)).catch(next);
    });
  };
}

module.exports = {
  auditMiddleware,
  auditWrapper
};

