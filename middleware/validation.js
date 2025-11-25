/**
 * Validation middleware
 */

// Validate uniqueId format
exports.validateUniqueId = (req, res, next) => {
  const { uniqueId } = req.body;
  
  if (!uniqueId) {
    return res.status(400).json({
      success: false,
      message: 'uniqueId is required'
    });
  }
  
  // Optional: Add format validation if needed
  // if (!/^[A-Z0-9]{8}$/.test(uniqueId)) {
  //   return res.status(400).json({
  //     success: false,
  //     message: 'Invalid uniqueId format'
  //   });
  // }
  
  next();
};

// Validate response status
exports.validateResponseStatus = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'submitted', 'approved', 'rejected'];
  
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }
  
  next();
};

// Validate email format
exports.validateEmail = (req, res, next) => {
  const email = req.body.userContact?.email || req.body.email;
  
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
  }
  
  next();
};

// Sanitize input to prevent injection
exports.sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potential harmful characters
      return obj.replace(/[<>]/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (let key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };
  
  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  next();
};

// Check if record exists
exports.checkRecordExists = (Model) => {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      
      let record;
      if (Model.findByIdOrUniqueId) {
        record = await Model.findByIdOrUniqueId(id);
      } else {
        record = await Model.findById(id);
      }
      
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Record not found'
        });
      }
      
      req.record = record;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error checking record',
        error: error.message
      });
    }
  };
};

// Rate limiting helper (basic)
const requestCounts = new Map();

exports.simpleRateLimit = (options = {}) => {
  const { windowMs = 60000, max = 100 } = options;
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(key)) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const data = requestCounts.get(key);
    
    if (now > data.resetTime) {
      data.count = 1;
      data.resetTime = now + windowMs;
      return next();
    }
    
    if (data.count >= max) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil((data.resetTime - now) / 1000)
      });
    }
    
    data.count++;
    next();
  };
};

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now > data.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

