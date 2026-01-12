const UnsubscribedEmail = require('../models/UnsubscribedEmail');

/**
 * Helper function to process unsubscribe
 */
const processUnsubscribe = async (email, req) => {
  // Sanitize and validate email format
  const sanitizedEmail = email.trim().toLowerCase();
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  
  if (!emailRegex.test(sanitizedEmail)) {
    throw new Error('Invalid email address format');
  }

  // Check if already unsubscribed
  const existing = await UnsubscribedEmail.findOne({ email: sanitizedEmail });
  
  if (existing) {
    return { alreadyUnsubscribed: true };
  }

  // Get IP address and user agent for tracking
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  // Create new unsubscribed email record
  await UnsubscribedEmail.create({
    email: sanitizedEmail,
    ipAddress,
    userAgent
  });

  return { alreadyUnsubscribed: false };
};

/**
 * Unsubscribe an email address via GET (one-click unsubscribe)
 * GET /api/unsubscribe?email=user@example.com
 */
exports.unsubscribeGet = async (req, res) => {
  try {
    const { email } = req.query;
    
    // Validate email
    if (!email) {
      return res.status(400).send('❌ No email address provided.');
    }

    try {
      await processUnsubscribe(email, req);
      return res.status(200).send('✅ You have been unsubscribed successfully.');
    } catch (error) {
      if (error.message === 'Invalid email address format') {
        return res.status(400).send('❌ Invalid email address.');
      }
      throw error;
    }
  } catch (error) {
    console.error('Error unsubscribing email:', error);
    
    // Handle duplicate key error (email already exists)
    if (error.code === 11000) {
      return res.status(200).send('✅ You have been unsubscribed successfully.');
    }

    return res.status(500).send('❌ Failed to process unsubscribe request.');
  }
};

/**
 * Unsubscribe an email address via POST
 * POST /api/unsubscribe
 */
exports.unsubscribe = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    try {
      const result = await processUnsubscribe(email, req);
      return res.status(200).json({
        success: true,
        message: 'You have been unsubscribed successfully.',
        alreadyUnsubscribed: result.alreadyUnsubscribed
      });
    } catch (error) {
      if (error.message === 'Invalid email address format') {
        return res.status(400).json({
          success: false,
          message: 'Invalid email address format'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error unsubscribing email:', error);
    
    // Handle duplicate key error (email already exists)
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: 'You have been unsubscribed successfully.',
        alreadyUnsubscribed: true
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process unsubscribe request'
    });
  }
};

/**
 * Get list of unsubscribed emails as text file
 * GET /api/unsubscribe/list?secret=YOUR_SECRET_KEY
 * Protected with secret key instead of authentication
 */
exports.getUnsubscribedList = async (req, res) => {
  try {
    // Check for secret key in query parameter or header
    const secretKey = req.query.secret || req.headers['x-unsubscribe-secret'];
    const requiredSecret = process.env.UNSUBSCRIBE_LIST_SECRET || 'change-this-secret-key';

    if (!secretKey || secretKey !== requiredSecret) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Valid secret key required.'
      });
    }

    // Fetch all unsubscribed emails, sorted by unsubscribed date
    const unsubscribedEmails = await UnsubscribedEmail.find({})
      .sort({ unsubscribedAt: -1 })
      .select('email -_id')
      .lean();

    // Extract just the email addresses
    const emailList = unsubscribedEmails.map(record => record.email);

    // Join emails with newlines
    const textContent = emailList.join('\n');

    // Set headers for text file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="unsubscribed-emails.txt"');
    res.setHeader('Content-Length', Buffer.byteLength(textContent, 'utf8'));

    // Send the text file
    res.send(textContent);
  } catch (error) {
    console.error('Error fetching unsubscribed list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unsubscribed list'
    });
  }
};

/**
 * Check if an email is unsubscribed
 * GET /api/unsubscribe/check?email=user@example.com
 */
exports.checkUnsubscribed = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const isUnsubscribed = await UnsubscribedEmail.findOne({ email: sanitizedEmail });

    res.status(200).json({
      success: true,
      isUnsubscribed: !!isUnsubscribed,
      email: sanitizedEmail
    });
  } catch (error) {
    console.error('Error checking unsubscribe status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check unsubscribe status'
    });
  }
};
