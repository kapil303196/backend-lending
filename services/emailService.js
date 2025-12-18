const nodemailer = require('nodemailer');

/**
 * Production-ready Email Service (Gmail)
 * Implements retry logic, error handling, and email templates
 */

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    this.fromName = process.env.EMAIL_FROM_NAME || 'LogicSpark MCA';
  }

  /**
   * Initialize Gmail transporter with OAuth2 Refresh Token
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const { 
        EMAIL_USER, 
        GMAIL_CLIENT_ID, 
        GMAIL_CLIENT_SECRET, 
        GMAIL_REFRESH_TOKEN 
      } = process.env;

      // Check if OAuth2 credentials are provided
      if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && EMAIL_USER) {
        // Use OAuth2 with refresh token (recommended for production)
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: EMAIL_USER,
            clientId: GMAIL_CLIENT_ID,
            clientSecret: GMAIL_CLIENT_SECRET,
            refreshToken: GMAIL_REFRESH_TOKEN,
            accessToken: undefined // Will be generated automatically
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 1000,
          rateLimit: 5
        });
        
        console.log('🔐 Using Gmail OAuth2 with refresh token');
      } else if (process.env.EMAIL_PASSWORD && EMAIL_USER) {
        // Fallback to App Password (for development)
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 1000,
          rateLimit: 5
        });
        
        console.log('🔑 Using Gmail App Password (fallback)');
      } else {
        throw new Error('Gmail credentials not configured. Set either OAuth2 credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) or EMAIL_PASSWORD in .env');
      }

      // Verify transporter configuration
      await this.transporter.verify();
      this.initialized = true;
      console.log('✅ Email service initialized successfully with Gmail');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
      throw new Error(`Email service initialization failed: ${error.message}`);
    }
  }

  /**
   * Send email with retry logic
   * @param {Object} options - Email options
   * @param {number} retries - Number of retry attempts
   */
  async sendEmail(options, retries = 3) {
    if (!this.initialized) {
      await this.initialize();
    }

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || this.stripHtml(options.html),
      attachments: options.attachments || []
    };

    // Add CC and BCC if provided
    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${options.to} (Attempt ${attempt}/${retries})`);
        console.log(`Message ID: ${info.messageId}`);
        
        return {
          success: true,
          messageId: info.messageId,
          response: info.response
        };
      } catch (error) {
        lastError = error;
        console.error(`❌ Email send attempt ${attempt}/${retries} failed:`, error.message);
        
        if (attempt < retries) {
          // Exponential backoff: wait 2^attempt seconds
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${waitTime / 1000} seconds...`);
          await this.sleep(waitTime);
        }
      }
    }

    // All retries failed
    console.error(`❌ Failed to send email to ${options.to} after ${retries} attempts`);
    throw lastError;
  }

  /**
   * Send welcome email with credentials
   */
  async sendWelcomeEmail(userEmail, userData) {
    const { name, email, password, uniqueId } = userData;

    const html = this.getWelcomeEmailTemplate({
      name: name || 'Valued Customer',
      email: email,
      password: password,
      uniqueId: uniqueId,
      loginUrl: process.env.FRONTEND_URL || 'https://your-app.com/login',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@logicspark.com'
    });

    return await this.sendEmail({
      to: userEmail,
      subject: '🎉 Welcome to LogicSpark MCA - Your Account Details',
      html: html
    });
  }

  /**
   * Send application submission confirmation
   */
  async sendApplicationConfirmation(userEmail, applicationData) {
    const { name, uniqueId, amountRequested, submittedAt } = applicationData;

    const html = this.getApplicationConfirmationTemplate({
      name: name || 'Valued Customer',
      uniqueId: uniqueId,
      amountRequested: amountRequested,
      submittedAt: submittedAt || new Date(),
      dashboardUrl: process.env.FRONTEND_URL || 'https://your-app.com/dashboard',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@logicspark.com'
    });

    return await this.sendEmail({
      to: userEmail,
      subject: '✅ Application Submitted Successfully - LogicSpark MCA',
      html: html
    });
  }

  /**
   * Send status update email
   */
  async sendStatusUpdateEmail(userEmail, statusData) {
    const { name, uniqueId, status, message } = statusData;

    const html = this.getStatusUpdateTemplate({
      name: name || 'Valued Customer',
      uniqueId: uniqueId,
      status: status,
      message: message,
      dashboardUrl: process.env.FRONTEND_URL || 'https://your-app.com/dashboard',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@logicspark.com'
    });

    const statusEmojis = {
      approved: '✅',
      rejected: '❌',
      pending: '⏳',
      submitted: '📝'
    };

    return await this.sendEmail({
      to: userEmail,
      subject: `${statusEmojis[status] || '📧'} Application Status Update - ${status.toUpperCase()}`,
      html: html
    });
  }

  /**
   * Welcome Email Template
   */
  getWelcomeEmailTemplate(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to LogicSpark MCA</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; margin-bottom: 10px; }
        .header p { color: #e0e7ff; font-size: 16px; }
        .content { padding: 40px 30px; }
        .welcome-box { background-color: #f8f9ff; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .credentials-box { background-color: #fff; border: 2px solid #667eea; padding: 25px; margin: 25px 0; border-radius: 8px; }
        .credentials-box h3 { color: #667eea; margin-bottom: 15px; font-size: 18px; }
        .credential-item { margin: 12px 0; padding: 12px; background-color: #f8f9ff; border-radius: 4px; }
        .credential-label { font-weight: 600; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .credential-value { font-size: 16px; color: #333; margin-top: 4px; font-family: 'Courier New', monospace; }
        .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; text-align: center; }
        .button:hover { opacity: 0.9; }
        .security-notice { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .security-notice strong { color: #856404; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
        .footer a { color: #667eea; text-decoration: none; }
        .divider { height: 1px; background-color: #e0e0e0; margin: 30px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to LogicSpark MCA</h1>
            <p>Your account has been created successfully</p>
        </div>
        
        <div class="content">
            <div class="welcome-box">
                <p>Hello <strong>${data.name}</strong>,</p>
                <p style="margin-top: 10px;">Thank you for choosing LogicSpark MCA. We're excited to have you on board! Your account has been created and you can now access our platform.</p>
            </div>

            <div class="credentials-box">
                <h3>🔐 Your Login Credentials</h3>
                <div class="credential-item">
                    <div class="credential-label">Email Address</div>
                    <div class="credential-value">${data.email}</div>
                </div>
                <div class="credential-item">
                    <div class="credential-label">Temporary Password</div>
                    <div class="credential-value">${data.password}</div>
                </div>
                <div class="credential-item">
                    <div class="credential-label">Application ID</div>
                    <div class="credential-value">${data.uniqueId}</div>
                </div>
            </div>

            <div class="security-notice">
                <strong>⚠️ Security Notice:</strong> For your security, please change your password after your first login. Keep your credentials confidential and never share them with anyone.
            </div>

            <div style="text-align: center;">
                <a href="${data.loginUrl}" class="button">Login to Your Account</a>
            </div>

            <div class="divider"></div>

            <h3 style="color: #667eea; margin-bottom: 15px;">📋 Next Steps</h3>
            <ol style="padding-left: 20px; color: #555;">
                <li style="margin: 10px 0;">Click the button above to access your account</li>
                <li style="margin: 10px 0;">Complete your profile information</li>
                <li style="margin: 10px 0;">Upload required documents</li>
                <li style="margin: 10px 0;">Track your application status in real-time</li>
            </ol>

            <div class="divider"></div>

            <p style="color: #666; font-size: 14px;">
                If you have any questions or need assistance, please don't hesitate to contact our support team at 
                <a href="mailto:${data.supportEmail}" style="color: #667eea;">${data.supportEmail}</a>
            </p>
        </div>

        <div class="footer">
            <p><strong>LogicSpark MCA</strong></p>
            <p style="margin: 10px 0;">Empowering businesses with flexible financing solutions</p>
            <p style="margin: 10px 0;">
                <a href="${data.loginUrl}">Dashboard</a> | 
                <a href="mailto:${data.supportEmail}">Support</a> | 
                <a href="#">Privacy Policy</a>
            </p>
            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} LogicSpark MCA. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Application Confirmation Email Template
   */
  getApplicationConfirmationTemplate(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Application Submitted</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; margin-bottom: 10px; }
        .header p { color: #d1fae5; font-size: 16px; }
        .content { padding: 40px 30px; }
        .success-icon { text-align: center; font-size: 64px; margin: 20px 0; }
        .info-box { background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .detail-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-label { font-weight: 600; color: #555; }
        .detail-value { color: #333; }
        .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
        .footer a { color: #10b981; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Application Submitted</h1>
            <p>We've received your application</p>
        </div>
        
        <div class="content">
            <div class="success-icon">🎉</div>
            
            <div class="info-box">
                <p>Hello <strong>${data.name}</strong>,</p>
                <p style="margin-top: 10px;">Your MCA application has been successfully submitted. Our team will review your application and get back to you shortly.</p>
            </div>

            <h3 style="color: #10b981; margin: 25px 0 15px;">Application Details</h3>
            <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                <div class="detail-item">
                    <span class="detail-label">Application ID:</span>
                    <span class="detail-value">${data.uniqueId}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Amount Requested:</span>
                    <span class="detail-value">$${data.amountRequested ? data.amountRequested.toLocaleString() : 'N/A'}</span>
                </div>
                <div class="detail-item" style="border-bottom: none;">
                    <span class="detail-label">Submitted On:</span>
                    <span class="detail-value">${new Date(data.submittedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="${data.dashboardUrl}" class="button">Track Application Status</a>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Need help? Contact us at <a href="mailto:${data.supportEmail}" style="color: #10b981;">${data.supportEmail}</a>
            </p>
        </div>

        <div class="footer">
            <p><strong>LogicSpark MCA</strong></p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} LogicSpark MCA. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Status Update Email Template
   */
  getStatusUpdateTemplate(data) {
    const statusColors = {
      approved: { bg: '#10b981', light: '#d1fae5', text: '#065f46' },
      rejected: { bg: '#ef4444', light: '#fee2e2', text: '#991b1b' },
      pending: { bg: '#f59e0b', light: '#fef3c7', text: '#92400e' },
      submitted: { bg: '#3b82f6', light: '#dbeafe', text: '#1e40af' }
    };

    const color = statusColors[data.status] || statusColors.pending;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Status Update</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: ${color.bg}; padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; margin-bottom: 10px; }
        .content { padding: 40px 30px; }
        .status-badge { display: inline-block; padding: 8px 16px; background-color: ${color.light}; color: ${color.text}; border-radius: 20px; font-weight: 600; text-transform: uppercase; font-size: 14px; }
        .info-box { background-color: ${color.light}; border-left: 4px solid ${color.bg}; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; padding: 14px 32px; background: ${color.bg}; color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Application Status Update</h1>
        </div>
        
        <div class="content">
            <p>Hello <strong>${data.name}</strong>,</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <span class="status-badge">${data.status}</span>
            </div>

            <div class="info-box">
                <p><strong>Application ID:</strong> ${data.uniqueId}</p>
                ${data.message ? `<p style="margin-top: 15px;">${data.message}</p>` : ''}
            </div>

            <div style="text-align: center;">
                <a href="${data.dashboardUrl}" class="button">View Dashboard</a>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Questions? Contact us at <a href="mailto:${data.supportEmail}" style="color: ${color.bg};">${data.supportEmail}</a>
            </p>
        </div>

        <div class="footer">
            <p><strong>LogicSpark MCA</strong></p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} LogicSpark MCA. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Strip HTML tags from string
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gracefully close email service
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      this.initialized = false;
      console.log('Email service closed');
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
