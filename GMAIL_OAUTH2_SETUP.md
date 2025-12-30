# 📧 Gmail OAuth2 Refresh Token Setup Guide

## 🎯 Why Use OAuth2 Refresh Tokens?

### Benefits over App Passwords:
- ✅ **More Secure** - Tokens can be revoked without changing password
- ✅ **No Daily Limits** - Gmail API has higher sending limits
- ✅ **Production Ready** - Recommended by Google for production apps
- ✅ **Auto-Refresh** - Access tokens refresh automatically
- ✅ **Better Control** - Fine-grained permissions

---

## 🚀 Step-by-Step Setup

### Step 1: Create Google Cloud Project

1. **Go to Google Cloud Console**
   ```
   https://console.cloud.google.com/
   ```

2. **Create New Project**
   - Click "Select a project" → "New Project"
   - Name: "MCA Lending Email Service"
   - Click "Create"

3. **Wait for project creation** (takes a few seconds)

---

### Step 2: Enable Gmail API

1. **Navigate to APIs & Services**
   - In the left sidebar: "APIs & Services" → "Library"

2. **Search for Gmail API**
   - Type "Gmail API" in the search box
   - Click on "Gmail API"

3. **Enable the API**
   - Click "Enable" button
   - Wait for activation

---

### Step 3: Create OAuth 2.0 Credentials

1. **Go to Credentials**
   - Left sidebar: "APIs & Services" → "Credentials"

2. **Configure OAuth Consent Screen** (if first time)
   - Click "Configure Consent Screen"
   - Select "External" (unless you have Google Workspace)
   - Click "Create"
   
   **Fill in required fields:**
   - App name: `MCA Lending`
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   
   **Scopes:**
   - Click "Add or Remove Scopes"
   - Search for: `https://mail.google.com/`
   - Select it
   - Click "Update" → "Save and Continue"
   
   **Test users:**
   - Add your Gmail address
   - Click "Save and Continue"

3. **Create OAuth Client ID**
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: **Desktop app**
   - Name: `MCA Email Service`
   - Click "Create"

4. **Download Credentials**
   - A popup will show your Client ID and Client Secret
   - **Copy both** - you'll need them!
   - Format:
     ```
     Client ID: xxxxx.apps.googleusercontent.com
     Client Secret: xxxxx
     ```

---

### Step 4: Generate Refresh Token

#### Method 1: Using OAuth2 Playground (Easiest)

1. **Go to OAuth2 Playground**
   ```
   https://developers.google.com/oauthplayground/
   ```

2. **Configure Settings** (Click gear icon ⚙️ on top right)
   - Check "Use your own OAuth credentials"
   - OAuth Client ID: `<paste your client ID>`
   - OAuth Client secret: `<paste your client secret>`
   - Close settings

3. **Select Gmail API**
   - In "Step 1: Select & authorize APIs"
   - Scroll down to "Gmail API v1"
   - Select: `https://mail.google.com/`
   - Click "Authorize APIs"

4. **Sign in with Google**
   - Choose your Gmail account
   - Click "Allow" to grant permissions
   - You'll be redirected back to playground

5. **Exchange Authorization Code**
   - In "Step 2: Exchange authorization code for tokens"
   - Click "Exchange authorization code for tokens"

6. **Copy Refresh Token**
   - You'll see:
     ```json
     {
       "access_token": "...",
       "refresh_token": "1//...",
       "expires_in": 3599,
       "token_type": "Bearer"
     }
     ```
   - **Copy the `refresh_token`** value (starts with `1//`)

---

#### Method 2: Using Node.js Script (Alternative)

Create `utils/generateRefreshToken.js`:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'your-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'your-client-secret';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = ['https://mail.google.com/'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', async (code) => {
  rl.close();
  const { tokens } = await oauth2Client.getToken(code);
  console.log('Refresh Token:', tokens.refresh_token);
});
```

**Run:**
```bash
npm install googleapis
node utils/generateRefreshToken.js
```

---

### Step 5: Configure Environment Variables

Add to your `.env` file:

```bash
# Gmail OAuth2 Configuration
EMAIL_USER=your-email@gmail.com
GMAIL_CLIENT_ID=xxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxxxx
GMAIL_REFRESH_TOKEN=1//xxxxx
EMAIL_FROM_NAME=Heroic Funding

# Application URLs
FRONTEND_URL=http://localhost:5173
SUPPORT_EMAIL=support@logicspark.com
```

**Important:**
- Replace `your-email@gmail.com` with your actual Gmail
- Replace `xxxxx` with your actual credentials
- Keep the refresh token starting with `1//`

---

## 🧪 Test Your Setup

### Option 1: Test Email Utility

```bash
npm run test-email
```

You should see:
```
🔐 Using Gmail OAuth2 with refresh token
✅ Email service initialized successfully with Gmail
```

### Option 2: Manual Test

Create `test-oauth-email.js`:

```javascript
require('dotenv').config();
const emailService = require('./services/emailService');

async function test() {
  try {
    await emailService.initialize();
    
    const result = await emailService.sendWelcomeEmail('test@example.com', {
      name: 'Test User',
      email: 'test@example.com',
      password: 'TestPass123',
      uniqueId: 'TEST-001'
    });
    
    console.log('✅ Email sent successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
```

Run:
```bash
node test-oauth-email.js
```

---

## 🔧 Troubleshooting

### Error: "invalid_grant"
**Cause:** Refresh token expired or revoked

**Solution:**
1. Go back to OAuth2 Playground
2. Revoke access
3. Generate new refresh token
4. Update `.env` file

### Error: "unauthorized_client"
**Cause:** OAuth consent screen not configured

**Solution:**
1. Go to Google Cloud Console
2. Configure OAuth consent screen
3. Add test users
4. Try again

### Error: "access_denied"
**Cause:** Gmail API not enabled

**Solution:**
1. Go to Google Cloud Console
2. Enable Gmail API
3. Wait a few minutes
4. Try again

### Error: "Daily sending limit exceeded"
**Cause:** Using App Password instead of OAuth2

**Solution:**
- Verify OAuth2 credentials are set in `.env`
- Check server logs for "🔐 Using Gmail OAuth2"
- If seeing "🔑 Using Gmail App Password", OAuth2 is not configured

---

## 📊 Comparison: OAuth2 vs App Password

| Feature | OAuth2 Refresh Token | App Password |
|---------|---------------------|--------------|
| **Security** | ✅ High (revokable) | ⚠️ Medium |
| **Setup** | ⚠️ Complex | ✅ Simple |
| **Daily Limit** | ✅ 10,000+ emails | ⚠️ 500 emails |
| **Production** | ✅ Recommended | ❌ Not recommended |
| **Auto-refresh** | ✅ Yes | ❌ N/A |
| **Revocation** | ✅ Easy | ⚠️ Requires password change |

---

## 🔐 Security Best Practices

### 1. Keep Credentials Secure
```bash
# Never commit .env file
echo ".env" >> .gitignore
```

### 2. Rotate Tokens Regularly
- Generate new refresh token every 6 months
- Revoke old tokens

### 3. Use Different Credentials for Environments
```bash
# Development
GMAIL_REFRESH_TOKEN=dev-token

# Production
GMAIL_REFRESH_TOKEN=prod-token
```

### 4. Monitor Usage
- Check Google Cloud Console for API usage
- Set up alerts for unusual activity

---

## 📈 Production Deployment

### Environment Variables

**Development (`.env`):**
```bash
EMAIL_USER=dev@yourdomain.com
GMAIL_CLIENT_ID=dev-client-id
GMAIL_CLIENT_SECRET=dev-secret
GMAIL_REFRESH_TOKEN=dev-refresh-token
```

**Production (Server environment):**
```bash
EMAIL_USER=noreply@yourdomain.com
GMAIL_CLIENT_ID=prod-client-id
GMAIL_CLIENT_SECRET=prod-secret
GMAIL_REFRESH_TOKEN=prod-refresh-token
```

### Deployment Checklist

- [ ] Create separate Google Cloud project for production
- [ ] Enable Gmail API
- [ ] Create OAuth2 credentials
- [ ] Generate refresh token
- [ ] Set environment variables on server
- [ ] Test email sending
- [ ] Monitor logs for errors
- [ ] Set up error alerts

---

## 🆘 Support

### Check Configuration
```bash
# View current email service mode
npm run dev

# Look for:
# 🔐 Using Gmail OAuth2 with refresh token  ← Good!
# 🔑 Using Gmail App Password (fallback)    ← Fallback mode
```

### Common Issues

**Issue:** Emails not sending
- Check server logs
- Verify all OAuth2 credentials are set
- Test with OAuth2 Playground

**Issue:** "Token expired"
- Refresh tokens don't expire unless revoked
- Check if token was revoked in Google account
- Generate new refresh token

**Issue:** "Insufficient permissions"
- Make sure scope is `https://mail.google.com/`
- Re-authorize with correct scope

---

## ✅ Quick Reference

### Required Environment Variables
```bash
EMAIL_USER=your-email@gmail.com
GMAIL_CLIENT_ID=xxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxxxx
GMAIL_REFRESH_TOKEN=1//xxxxx
EMAIL_FROM_NAME=Heroic Funding
```

### Key URLs
- **Google Cloud Console:** https://console.cloud.google.com/
- **OAuth2 Playground:** https://developers.google.com/oauthplayground/
- **Gmail API Docs:** https://developers.google.com/gmail/api

---

## 🎉 You're Done!

Your email service now uses:
- ✅ OAuth2 refresh tokens
- ✅ Automatic token refresh
- ✅ Higher sending limits
- ✅ Production-ready security

**Fallback:** If OAuth2 is not configured, the system automatically falls back to App Password for development.

---

**Need Help?** Check server logs for detailed error messages!
