# 📧 Email Service - Gmail Setup Guide

## 🎯 What This Does

Your MCA Lending application automatically sends professional emails to users when they:
1. ✅ Submit their application → **Welcome Email** (with credentials) + **Confirmation Email**
2. ✅ Have their status updated → **Status Update Email**

## ⚡ Quick Setup (2 Minutes)

### Step 1: Get Gmail App Password

1. **Go to:** https://myaccount.google.com/apppasswords
2. **Enable 2-Step Verification** (if not already enabled)
3. **Create App Password:**
   - Click "Select app" → Choose "Mail"
   - Click "Select device" → Choose "Other" → Enter "MCA Backend"
   - Click "Generate"
4. **Copy the 16-character password** (format: xxxx-xxxx-xxxx-xxxx)

### Step 2: Configure Environment Variables

Add these to your `.env` file:

```bash
# Email Service Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Your 16-char App Password
EMAIL_FROM_NAME=Heroic Funding

# Application URLs
FRONTEND_URL=http://localhost:5173
SUPPORT_EMAIL=support@logicspark.com
```

### Step 3: Test It

```bash
npm run test-email
```

**That's it!** 🎉 Your email service is ready!

## 📧 Email Templates

### 1. Welcome Email
**Sent when:** User submits application  
**Subject:** 🎉 Welcome to Heroic Funding - Your Account Details  
**Contains:**
- User's name and greeting
- Login email
- Temporary password (auto-generated, 12 characters)
- Application ID
- Security notice
- Login button
- Next steps

### 2. Application Confirmation
**Sent when:** User submits application  
**Subject:** ✅ Application Submitted Successfully  
**Contains:**
- Confirmation message
- Application ID
- Amount requested
- Submission date
- Track status button

### 3. Status Update
**Sent when:** Admin changes application status  
**Subject:** Status Update - [APPROVED/REJECTED/etc]  
**Contains:**
- Color-coded status badge
- Application ID
- Custom message based on status
- Dashboard link

## 🧪 Testing

### Option 1: Interactive Test Tool (Recommended)

```bash
npm run test-email
```

This will:
1. ✅ Check your Gmail configuration
2. ✅ Validate environment variables
3. ✅ Let you choose which email to send
4. ✅ Send test email to your specified address
5. ✅ Show helpful error messages if something fails

### Option 2: API Testing

**Create a user response (triggers 2 emails):**

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

**Update status (triggers 1 email):**

```bash
PATCH http://localhost:3000/api/user-responses/:id/status
Content-Type: application/json

{
  "status": "approved"
}
```

## 📊 Monitoring

### Check Server Logs

Your backend server will log all email activity:

**Successful emails:**
```
✅ Email service initialized successfully with Gmail
✅ Email sent successfully to user@example.com (Attempt 1/3)
Message ID: <12345@gmail.com>
✅ Welcome email sent successfully to user@example.com
✅ Application confirmation email sent to user@example.com
```

**Failed emails (with retry):**
```
❌ Email send attempt 1/3 failed: Connection timeout
⏳ Retrying in 2 seconds...
❌ Email send attempt 2/3 failed: Connection timeout
⏳ Retrying in 4 seconds...
✅ Email sent successfully to user@example.com (Attempt 3/3)
```

## 🐛 Troubleshooting

### Issue: "Email service initialization failed"
**Cause:** Missing environment variables  
**Solution:** 
- Check your `.env` file has `EMAIL_USER`, `EMAIL_PASSWORD`, and `EMAIL_FROM_NAME`
- Make sure there are no typos

### Issue: "Authentication failed" or "Invalid credentials"
**Cause:** Using regular password instead of App Password  
**Solution:**
- Generate a new App Password at https://myaccount.google.com/apppasswords
- Make sure 2-Step Verification is enabled
- Use the 16-character App Password, not your regular Gmail password

### Issue: Emails not received
**Check:**
1. ✅ Spam/Junk folder
2. ✅ Gmail "All Mail" folder
3. ✅ Server logs for errors
4. ✅ Email address is correct

### Issue: Emails going to spam
**Solutions:**
- Use a professional "from" name (already set as "Heroic Funding")
- Don't send too many emails too quickly
- Recipients should add your email to contacts
- For production, consider using a custom domain

### Issue: "Daily sending limit exceeded"
**Cause:** Gmail has a limit of 500 emails per day  
**Solution:**
- This is normal for Gmail
- Limit is reset every 24 hours
- For high-volume needs, consider upgrading to Google Workspace

## ✨ Features

- ✅ **Automatic Retry Logic** - 3 attempts with exponential backoff (2s, 4s, 8s)
- ✅ **Non-Blocking** - Emails sent asynchronously, doesn't slow down API
- ✅ **Beautiful HTML Templates** - Professional, responsive design
- ✅ **Secure Passwords** - Auto-generated 12-character passwords
- ✅ **Connection Pooling** - Better performance for multiple emails
- ✅ **Rate Limiting** - Prevents sending too many emails too fast
- ✅ **Comprehensive Logging** - Track success and failures

## 🎨 Customization

### Change Email Templates

Edit `services/emailService.js` and modify the template methods:

```javascript
getWelcomeEmailTemplate(data) {
  // Modify HTML here
  // Change colors, text, layout, etc.
  return `<!DOCTYPE html>...`;
}
```

### Change Email Colors

In the template methods, look for color codes:
- **Purple gradient:** `#667eea` → `#764ba2` (Welcome email)
- **Green gradient:** `#10b981` → `#059669` (Confirmation)
- **Status colors:** Defined in `getStatusUpdateTemplate()`

### Add Your Logo

Add an `<img>` tag in the header section of each template:

```html
<div class="header">
    <img src="https://your-domain.com/logo.png" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">
    <h1>🎉 Welcome to Heroic Funding</h1>
</div>
```

## 📁 Files Created

```
backend-lending/
├── services/
│   └── emailService.js          # Main email service (Gmail only)
├── utils/
│   └── testEmail.js             # Interactive test utility
└── EMAIL_GMAIL_SETUP.md         # This file
```

## 📁 Files Modified

```
backend-lending/
├── controllers/
│   └── userResponseController.js  # Added email integration
├── package.json                   # Added nodemailer + test script
└── .env.example                   # Added Gmail config
```

## 🚀 Next Steps

1. ✅ **Configure Gmail** (see Step 1-2 above)
2. ✅ **Test emails:** `npm run test-email`
3. ✅ **Customize templates** (optional)
4. ✅ **Update branding** (optional)
5. ✅ **Start using!**

## 💡 Pro Tips

### Development
- Use your personal Gmail for testing
- Check spam folder for test emails
- Use `npm run test-email` before deploying

### Production
- Consider using Google Workspace for higher limits
- Use a professional email address (e.g., noreply@yourdomain.com)
- Monitor daily sending limits
- Set up email forwarding for support emails

### Security
- ✅ Never commit `.env` file to Git
- ✅ Use App Passwords, never regular passwords
- ✅ Rotate App Passwords periodically
- ✅ Keep credentials secure

## 📞 Support

**Test your setup:**
```bash
npm run test-email
```

**Check logs:**
- Look for `✅` (success) or `❌` (error) in server console
- All email activity is logged with details

**Common fixes:**
- Regenerate App Password
- Check environment variables
- Verify 2-Step Verification is enabled
- Check spam folder

---

## 🎉 You're Ready!

Your email service is configured and will automatically send:
- ✅ Welcome emails with credentials
- ✅ Application confirmations
- ✅ Status update notifications

**Just start your server and create a user response to see it in action!** 🚀

---

**Questions?** Run `npm run test-email` to diagnose any issues.

**Need to customize?** Edit `services/emailService.js` templates.

**Having issues?** Check server logs for detailed error messages.
