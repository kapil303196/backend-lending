# 📧 Email Service - Quick Start Guide

## What Was Implemented

A **production-ready email service** that automatically sends emails to users when:

1. ✅ **User submits an application** → Receives welcome email with credentials + confirmation email
2. ✅ **Admin updates application status** → User receives status update notification

## Features

- 🔄 **Automatic retry logic** (3 attempts with exponential backoff)
- 🎨 **Beautiful HTML email templates** (responsive, professional)
- 📧 **Multiple provider support** (Gmail, SendGrid, AWS SES)
- ⚡ **Non-blocking async sending** (doesn't slow down API responses)
- 🔒 **Secure password generation** (12-character random passwords)
- 📊 **Comprehensive logging** (success/failure tracking)

## Quick Setup (5 Minutes)

### Option 1: Gmail (Easiest for Testing)

1. **Generate App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Enable 2-Step Verification if not already enabled
   - Create app password for "Mail"
   - Copy the 16-character password

2. **Add to `.env` file:**
   ```bash
   EMAIL_PROVIDER=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Your app password
   EMAIL_FROM=your-email@gmail.com
   EMAIL_FROM_NAME=Heroic Funding
   FRONTEND_URL=http://localhost:5173
   SUPPORT_EMAIL=support@logicspark.com
   ```

3. **Test it:**
   ```bash
   npm run test-email
   ```

### Option 2: SendGrid (Best for Production)

1. **Get API Key:**
   - Sign up at: https://sendgrid.com
   - Go to Settings → API Keys
   - Create new key with "Mail Send" permission
   - **Important:** Verify your sender email in SendGrid dashboard!

2. **Add to `.env` file:**
   ```bash
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_FROM_NAME=Heroic Funding
   FRONTEND_URL=http://localhost:5173
   SUPPORT_EMAIL=support@logicspark.com
   ```

3. **Test it:**
   ```bash
   npm run test-email
   ```

## Testing

### Interactive Test Tool

Run the interactive test utility:

```bash
npm run test-email
```

This will:
- ✅ Check your configuration
- ✅ Validate environment variables
- ✅ Let you send test emails
- ✅ Show helpful error messages

### Manual API Test

**1. Create a user response (triggers welcome + confirmation emails):**

```bash
POST http://localhost:3000/api/user-responses
Content-Type: application/json

{
  "uniqueId": "MCA-12345",
  "formData": {
    "email": "test@example.com",
    "businessName": "Test Business",
    "ownerName": "John Doe",
    "amountRequested": 50000,
    "monthlyRevenue": 100000
  }
}
```

**2. Update status (triggers status update email):**

```bash
PATCH http://localhost:3000/api/user-responses/:id/status
Content-Type: application/json

{
  "status": "approved"
}
```

## Email Templates Preview

### 1. Welcome Email
- **Subject:** 🎉 Welcome to Heroic Funding - Your Account Details
- **Contains:**
  - User's name and greeting
  - Login credentials (email + temporary password)
  - Application ID
  - Security notice
  - Login button
  - Next steps

### 2. Application Confirmation
- **Subject:** ✅ Application Submitted Successfully
- **Contains:**
  - Confirmation message
  - Application details (ID, amount, date)
  - Track status button
  - Support contact

### 3. Status Update
- **Subject:** Status Update - [APPROVED/REJECTED/etc]
- **Contains:**
  - Color-coded status badge
  - Application ID
  - Custom message
  - Dashboard link

## Monitoring

### Check Logs

Your server will log all email activity:

```
✅ Email sent successfully to user@example.com (Attempt 1/3)
✅ Message ID: <12345@gmail.com>
✅ Welcome email sent successfully to user@example.com
✅ Application confirmation email sent to user@example.com
```

### Failed Emails

If an email fails, you'll see:

```
❌ Email send attempt 1/3 failed: Connection timeout
⏳ Retrying in 2 seconds...
❌ Failed to send email to user@example.com after 3 attempts
```

## Troubleshooting

### "Email service initialization failed"
- ✅ Check `.env` file has all required variables
- ✅ For Gmail: Use App Password, not regular password
- ✅ For SendGrid: Verify sender email in dashboard

### Emails going to spam
- ✅ Use a professional sender email (not Gmail for production)
- ✅ Verify your domain in SendGrid/SES
- ✅ Set up SPF/DKIM records

### "Authentication failed"
- ✅ Gmail: Generate new App Password
- ✅ SendGrid: Check API key is correct
- ✅ SES: Verify AWS credentials

## Files Created

```
backend-lending/
├── services/
│   └── emailService.js          # Main email service (singleton)
├── utils/
│   └── testEmail.js             # Interactive test utility
├── EMAIL_SERVICE_GUIDE.md       # Comprehensive documentation
└── EMAIL_QUICKSTART.md          # This file
```

## Files Modified

```
backend-lending/
├── controllers/
│   └── userResponseController.js  # Added email integration
├── package.json                   # Added nodemailer + test script
└── .env.example                   # Added email config examples
```

## Next Steps

1. ✅ **Configure your email provider** (see setup above)
2. ✅ **Test the email service** (`npm run test-email`)
3. ✅ **Customize email templates** (edit `services/emailService.js`)
4. ✅ **Update branding** (change colors, logos, text)
5. ✅ **Set up production provider** (SendGrid or SES recommended)

## Production Checklist

Before going live:

- [ ] Switch to SendGrid or AWS SES
- [ ] Verify sender domain
- [ ] Set up SPF, DKIM, DMARC records
- [ ] Update `FRONTEND_URL` to production URL
- [ ] Update `SUPPORT_EMAIL` to real support email
- [ ] Test all email types
- [ ] Customize email templates with your branding
- [ ] Set up email monitoring/alerts

## Support

- 📖 **Full Documentation:** `EMAIL_SERVICE_GUIDE.md`
- 🧪 **Test Utility:** `npm run test-email`
- 📧 **Questions:** Check server logs for detailed error messages

---

**Ready to send emails!** 🚀

Start your server and create a user response to see it in action!
