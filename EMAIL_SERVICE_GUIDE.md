# Email Service Documentation

## Overview

The Email Service is a production-ready, enterprise-grade email solution for the MCA Lending application. It supports multiple email providers, includes retry logic, error handling, and beautiful HTML email templates.

## Features

✅ **Multiple Email Providers**
- Gmail (with App Passwords)
- SendGrid
- AWS SES

✅ **Production-Ready Features**
- Automatic retry logic with exponential backoff
- Connection pooling for better performance
- Rate limiting to prevent abuse
- Comprehensive error handling and logging
- Asynchronous email sending (non-blocking)

✅ **Beautiful Email Templates**
- Welcome emails with credentials
- Application confirmation emails
- Status update notifications
- Responsive HTML design
- Professional branding

## Setup Instructions

### 1. Choose Your Email Provider

#### Option A: Gmail (Recommended for Development)

**Pros:** Easy to set up, free, reliable
**Cons:** Daily sending limits (500 emails/day)

**Setup Steps:**
1. Go to your Google Account settings
2. Navigate to Security → 2-Step Verification (enable if not already)
3. Go to Security → App Passwords
4. Generate a new app password for "Mail"
5. Copy the 16-character password

**Environment Variables:**
```bash
EMAIL_PROVIDER=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=LogicSpark MCA
```

#### Option B: SendGrid (Recommended for Production)

**Pros:** High deliverability, detailed analytics, 100 emails/day free tier
**Cons:** Requires account verification

**Setup Steps:**
1. Sign up at [SendGrid](https://sendgrid.com/)
2. Verify your email and complete account setup
3. Go to Settings → API Keys
4. Create a new API key with "Mail Send" permissions
5. Copy the API key

**Environment Variables:**
```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=LogicSpark MCA
```

**Important:** You must verify your sender email in SendGrid dashboard!

#### Option C: AWS SES (Recommended for High Volume)

**Pros:** Highly scalable, very cheap ($0.10 per 1000 emails)
**Cons:** Requires AWS account, starts in sandbox mode

**Setup Steps:**
1. Log in to AWS Console
2. Navigate to Amazon SES
3. Verify your email address or domain
4. Request production access (if needed)
5. Use existing AWS credentials from S3 setup

**Environment Variables:**
```bash
EMAIL_PROVIDER=ses
# AWS credentials are already configured for S3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=LogicSpark MCA
```

### 2. Configure Environment Variables

Add these to your `.env` file:

```bash
# Email Service Configuration
EMAIL_PROVIDER=gmail  # or sendgrid, or ses
EMAIL_FROM=noreply@logicspark.com
EMAIL_FROM_NAME=LogicSpark MCA

# Provider-specific credentials (choose one)
# ... (see above)

# Application URLs
FRONTEND_URL=http://localhost:5173
SUPPORT_EMAIL=support@logicspark.com
```

### 3. Test Your Configuration

The email service will automatically initialize when the first email is sent. Check your server logs for:

```
✅ Email service initialized successfully with gmail
```

If you see an error, check:
- Your credentials are correct
- For Gmail: You're using an App Password, not your regular password
- For SendGrid: Your sender email is verified
- For SES: Your email/domain is verified and you're not in sandbox mode

## Usage

### Automatic Email Sending

Emails are automatically sent in the following scenarios:

#### 1. **User Response Created** (`POST /api/user-responses`)
When a user submits their application, they receive:
- **Welcome Email** with temporary credentials
- **Application Confirmation** with submission details

#### 2. **Status Updated** (`PATCH /api/user-responses/:id/status`)
When an admin updates the application status, the user receives:
- **Status Update Email** with the new status and relevant message

### Manual Email Sending

You can also send emails programmatically:

```javascript
const emailService = require('./services/emailService');

// Send welcome email
await emailService.sendWelcomeEmail('user@example.com', {
  name: 'John Doe',
  email: 'user@example.com',
  password: 'TempPass123!',
  uniqueId: 'MCA-12345'
});

// Send application confirmation
await emailService.sendApplicationConfirmation('user@example.com', {
  name: 'John Doe',
  uniqueId: 'MCA-12345',
  amountRequested: 50000,
  submittedAt: new Date()
});

// Send status update
await emailService.sendStatusUpdateEmail('user@example.com', {
  name: 'John Doe',
  uniqueId: 'MCA-12345',
  status: 'approved',
  message: 'Congratulations! Your application has been approved.'
});
```

## Email Templates

### Welcome Email
- **Subject:** 🎉 Welcome to LogicSpark MCA - Your Account Details
- **Content:** 
  - Greeting with user's name
  - Login credentials (email + temporary password)
  - Application ID
  - Security notice
  - Next steps
  - Login button

### Application Confirmation
- **Subject:** ✅ Application Submitted Successfully - LogicSpark MCA
- **Content:**
  - Confirmation message
  - Application details (ID, amount, date)
  - Track status button
  - Support contact

### Status Update
- **Subject:** Status Update - [STATUS]
- **Content:**
  - Status badge (color-coded)
  - Application ID
  - Custom message based on status
  - Dashboard link

## Error Handling

The email service includes comprehensive error handling:

### Retry Logic
- Automatically retries failed emails up to 3 times
- Uses exponential backoff (2s, 4s, 8s)
- Logs each attempt

### Non-Blocking
- Emails are sent asynchronously
- Application responses are not delayed by email sending
- Failed emails are logged but don't fail the request

### Logging
```
✅ Email sent successfully to user@example.com (Attempt 1/3)
✅ Message ID: <message-id>
❌ Email send attempt 1/3 failed: Connection timeout
⏳ Retrying in 2 seconds...
```

## Monitoring

### Check Email Logs

Monitor your server logs for email-related messages:

```bash
# Successful sends
grep "Email sent successfully" logs/server.log

# Failed sends
grep "Failed to send email" logs/server.log

# Email service status
grep "Email service" logs/server.log
```

### Provider-Specific Monitoring

- **Gmail:** Check sent items in your Gmail account
- **SendGrid:** Use SendGrid dashboard for detailed analytics
- **AWS SES:** Use CloudWatch for metrics and bounce tracking

## Troubleshooting

### Common Issues

#### "Email service initialization failed"
- **Cause:** Missing or incorrect credentials
- **Solution:** Check your `.env` file and ensure all required variables are set

#### "Authentication failed" (Gmail)
- **Cause:** Using regular password instead of App Password
- **Solution:** Generate and use an App Password from Google Account settings

#### "Sender not verified" (SendGrid/SES)
- **Cause:** Email address not verified in provider dashboard
- **Solution:** Verify your sender email in SendGrid or AWS SES console

#### Emails going to spam
- **Solution:** 
  - Use a verified domain email (not Gmail)
  - Set up SPF, DKIM, and DMARC records
  - Use SendGrid or SES for better deliverability

## Best Practices

### Security
✅ Never commit `.env` file to version control
✅ Use App Passwords for Gmail, never regular passwords
✅ Rotate API keys regularly
✅ Use environment-specific credentials

### Performance
✅ Emails are sent asynchronously (non-blocking)
✅ Connection pooling is enabled
✅ Rate limiting prevents abuse

### Deliverability
✅ Use professional email templates
✅ Include unsubscribe links (for marketing emails)
✅ Monitor bounce rates
✅ Keep email lists clean

## Customization

### Modify Email Templates

Edit the template methods in `services/emailService.js`:

```javascript
getWelcomeEmailTemplate(data) {
  // Customize HTML here
}
```

### Add New Email Types

```javascript
async sendCustomEmail(userEmail, customData) {
  const html = this.getCustomEmailTemplate(customData);
  
  return await this.sendEmail({
    to: userEmail,
    subject: 'Your Custom Subject',
    html: html
  });
}
```

### Change Email Styling

Templates use inline CSS for maximum compatibility. Modify the `<style>` tags in each template method.

## Production Checklist

Before deploying to production:

- [ ] Choose production email provider (SendGrid or SES recommended)
- [ ] Verify sender email/domain
- [ ] Set up SPF, DKIM, DMARC records
- [ ] Configure production environment variables
- [ ] Test all email types
- [ ] Set up email monitoring/alerts
- [ ] Configure bounce/complaint handling
- [ ] Review email content for branding
- [ ] Test on multiple email clients
- [ ] Set up backup email provider (optional)

## Support

For issues or questions:
- Check server logs for error messages
- Review this documentation
- Contact: support@logicspark.com

---

**Last Updated:** December 2025
**Version:** 1.0.0
