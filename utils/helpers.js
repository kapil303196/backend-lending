const crypto = require('crypto');

/**
 * Generate a unique ID
 */
exports.generateUniqueId = (length = 8) => {
  return crypto.randomBytes(length / 2).toString('hex').toUpperCase();
};

/**
 * Convert string to camelCase
 */
exports.toCamelCase = (str) => {
  return str
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .map((word, index) =>
      index === 0 
        ? word.toLowerCase() 
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
};

/**
 * Paginate results
 */
exports.paginate = (query, page = 1, limit = 50) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  return query.skip(skip).limit(parseInt(limit));
};

/**
 * Build query filters from request
 */
exports.buildFilters = (queryParams, allowedFilters = []) => {
  const filters = {};
  
  allowedFilters.forEach(filter => {
    if (queryParams[filter] !== undefined) {
      // Handle boolean values
      if (queryParams[filter] === 'true') {
        filters[filter] = true;
      } else if (queryParams[filter] === 'false') {
        filters[filter] = false;
      } else {
        filters[filter] = queryParams[filter];
      }
    }
  });
  
  return filters;
};

/**
 * Build sort object from request
 */
exports.buildSort = (sortBy = 'createdAt', sortOrder = 'desc') => {
  return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
};

/**
 * Format success response
 */
exports.successResponse = (data, message = null) => {
  const response = { success: true };
  if (message) response.message = message;
  if (data !== undefined) response.data = data;
  return response;
};

/**
 * Format error response
 */
exports.errorResponse = (message, error = null) => {
  const response = { success: false, message };
  if (error && process.env.NODE_ENV === 'development') {
    response.error = error.message || error;
  }
  return response;
};

/**
 * Clean undefined/null values from object
 */
exports.cleanObject = (obj) => {
  const cleaned = {};
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== null) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        cleaned[key] = exports.cleanObject(obj[key]);
      } else {
        cleaned[key] = obj[key];
      }
    }
  }
  return cleaned;
};

/**
 * Async handler wrapper to catch errors
 */
exports.asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Calculate percentage
 */
exports.calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return ((value / total) * 100).toFixed(2);
};

/**
 * Format date to ISO string
 */
exports.formatDate = (date) => {
  return date ? new Date(date).toISOString() : null;
};

/**
 * Check if string is valid MongoDB ObjectId
 */
exports.isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Mask sensitive information
 */
exports.maskEmail = (email) => {
  if (!email) return '';
  const [name, domain] = email.split('@');
  const maskedName = name.charAt(0) + '*'.repeat(name.length - 2) + name.charAt(name.length - 1);
  return `${maskedName}@${domain}`;
};

exports.maskPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return '*'.repeat(cleaned.length);
  return '*'.repeat(cleaned.length - 4) + cleaned.slice(-4);
};

/**
 * Generate link for user verification
 */
exports.generateVerificationLink = (uniqueId, baseUrl = 'http://localhost:3000') => {
  return `${baseUrl}/verify/${uniqueId}`;
};

/**
 * Sleep/delay function
 */
exports.sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

