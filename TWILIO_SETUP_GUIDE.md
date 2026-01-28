# Twilio Call Center Setup Guide

## Overview

This guide explains how to set up and use the Twilio call center integration for inbound and outbound call tracking, recording, and management.

## Features

- ✅ **Inbound Call Handling**: IVR with extension routing to 6 team members
- ✅ **Outbound Call Dialer**: Click-to-call functionality from admin panel
- ✅ **Automatic Call Recording**: Configurable per direction (inbound/outbound)
- ✅ **Call Tracking**: All calls stored with business association
- ✅ **Call History**: Filterable by business, agent, phone number, date range
- ✅ **Twilio Signature Validation**: Production-grade security for webhooks
- ✅ **Error Handling**: Comprehensive error handling and logging

---

## Initial Setup

### 1. Configure Twilio in Admin Panel

1. Navigate to `/admin/twilio` in your admin dashboard
2. Enter your Twilio credentials:
   - **Account SID**: From Twilio Console → Account Info
   - **Auth Token**: From Twilio Console → Account Info
   - **Primary Number**: Your Twilio phone number (E.164 format: `+1234567890`)
   - **Outbound Caller ID**: Usually same as Primary Number
3. Configure recording preferences:
   - Enable recordings (master toggle)
   - Record inbound calls
   - Record outbound calls
4. Click **Save Settings**

### 2. Set Up Extensions

1. In the same `/admin/twilio` page, scroll to **Team Extensions**
2. Add up to 6 (or more) extensions:
   - **Name**: Agent name (e.g., "John Smith")
   - **Extension**: 3-digit code (e.g., "101", "102", etc.)
   - **Forwarding Number**: Agent's cell phone or desk phone (E.164 format: `+1234567890`)
   - **Active**: Toggle to enable/disable
3. Click **Save Extensions**

### 3. Configure Twilio Webhooks

In your Twilio Console (https://console.twilio.com):

#### For Your Phone Number:

1. Go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your Twilio phone number
3. Scroll to **Voice & Fax** section
4. Configure:

   **A CALL COMES IN**:
   - Webhook: `POST`
   - URL: `https://YOUR_API_DOMAIN/api/twilio/voice/inbound`
   - Method: `POST`

   **CALL STATUS CHANGES**:
   - Status Callback URL: `https://YOUR_API_DOMAIN/api/twilio/call-status`
   - Status Callback Method: `POST`
   - Status Callback Events: Select all (initiated, ringing, answered, completed)

#### For Recording Callbacks (Account Level):

1. Go to **Monitor** → **Logs** → **Recordings**
2. Or configure per-call in TwiML (already handled in code)

**Note**: Replace `YOUR_API_DOMAIN` with your actual backend URL (e.g., `https://api.yourdomain.com`)

### 4. Environment Variables

Ensure your `.env` file includes:

```env
API_BASE_URL=https://your-api-domain.com
# This is used to construct TwiML callback URLs
```

---

## Call Flow

### Inbound Call Flow

1. **Caller dials your Twilio number**
   - Twilio sends webhook to `/api/twilio/voice/inbound`
   - System creates `Call` record with `direction: "inbound"`
   - System attempts to match caller's phone number to existing business records

2. **IVR prompts for extension**
   - Twilio plays: "Thank you for calling. Please enter the 3 digit extension..."
   - Caller enters extension (e.g., "101")

3. **Extension routing**
   - Twilio sends digits to `/api/twilio/ivr/extension`
   - System looks up extension in `AgentExtension` collection
   - If found and active, call is forwarded to agent's `forwardingNumber`
   - Call record is updated with `agentExtension` and `agentId`

4. **Call status updates**
   - Throughout the call, Twilio sends status updates to `/api/twilio/call-status`
   - System updates `Call` record with status, duration, timestamps

5. **Recording ready**
   - If recording enabled, Twilio sends recording URL to `/api/twilio/recording-status`
   - System saves `recordingUrl` and `recordingDurationSeconds` to `Call` record

6. **Call appears in dashboard**
   - Go to `/admin/calls` to view call history
   - Filter by phone number, agent, direction, date range
   - Click **Play** button to listen to recording

### Outbound Call Flow

1. **Admin initiates call**
   - Admin calls API: `POST /api/twilio/dialer/outbound`
   - Body: `{ "toNumber": "+1234567890", "agentExtension": "101" }`
   - System validates phone numbers and extension

2. **Twilio initiates call**
   - System calls Twilio API to dial agent's forwarding number (if extension provided)
   - Or directly dials customer number (if no extension)
   - TwiML URL points to `/api/twilio/outbound-bridge?to=CUSTOMER_NUMBER`

3. **Bridge to customer**
   - When agent answers, Twilio requests TwiML from `/api/twilio/outbound-bridge`
   - System returns TwiML to dial customer number
   - Call is bridged: Agent ↔ Customer

4. **Call tracking**
   - Same status and recording callbacks as inbound calls
   - Call record shows `direction: "outbound"` with agent association

---

## API Endpoints

### Public Webhooks (Called by Twilio)

All webhook endpoints validate Twilio signature for security.

- `POST /api/twilio/voice/inbound` - Inbound call handler
- `POST /api/twilio/ivr/extension` - Extension selection handler
- `POST /api/twilio/call-status` - Call status updates
- `POST /api/twilio/recording-status` - Recording status updates
- `GET/POST /api/twilio/outbound-bridge` - Outbound bridge TwiML

### Admin APIs (Requires Authentication)

- `GET /api/twilio/calls` - List calls with filters
- `GET /api/twilio/extensions` - List all extensions
- `POST /api/twilio/extensions` - Create extension
- `PUT /api/twilio/extensions/:id` - Update extension
- `DELETE /api/twilio/extensions/:id` - Delete extension
- `POST /api/twilio/dialer/outbound` - Initiate outbound call

---

## Security Features

### Twilio Signature Validation

All webhook endpoints use Twilio's official signature validation:

```javascript
twilio.validateRequest(authToken, signature, url, params)
```

This ensures requests are actually from Twilio and haven't been tampered with.

### Phone Number Normalization

All phone numbers are normalized to E.164 format (`+1234567890`) for consistency:
- Removes formatting characters
- Adds country code if missing
- Validates format before processing

### Input Validation

- Extension format: 3-4 digits
- Phone numbers: E.164 format validation
- ObjectId validation for MongoDB references
- Date format validation for filters

### Error Handling

- All webhook endpoints return valid TwiML even on errors (to prevent Twilio retries)
- Database errors don't fail calls (logged but call continues)
- Comprehensive error logging for debugging
- User-friendly error messages in admin APIs

---

## Business Association

Calls are automatically associated with businesses by matching phone numbers:

1. System normalizes caller/called phone number
2. Searches `UserResponse` collection for matching phone in:
   - `userContact.phone`
   - `formData.phone`
   - `formData.businessPhone`
   - `formData.ownerPhone`
   - `formData.ownerInfo.phone`
3. If match found:
   - Links `Call` to `UserResponse` and `MCA` records
   - Sets `businessName` from form data or MCA company name

This allows viewing all calls per business in the admin panel.

---

## Testing

### Test Inbound Call

1. Call your Twilio phone number
2. Enter a configured extension (e.g., "101")
3. Verify call routes to agent's forwarding number
4. Check `/admin/calls` - call should appear with:
   - Direction: "inbound"
   - Agent extension
   - Recording (if enabled)

### Test Outbound Call

1. Use Postman or curl:
   ```bash
   POST https://your-api/api/twilio/dialer/outbound
   Authorization: Bearer YOUR_ADMIN_TOKEN
   Content-Type: application/json
   
   {
     "toNumber": "+1234567890",
     "agentExtension": "101"
   }
   ```
2. Verify agent's phone rings first
3. When agent answers, customer number is dialed
4. Check `/admin/calls` - call should appear with:
   - Direction: "outbound"
   - Agent extension
   - Recording (if enabled)

---

## Troubleshooting

### Calls not appearing in dashboard

- Check Twilio webhook URLs are correctly configured
- Verify `API_BASE_URL` environment variable is set
- Check server logs for webhook errors
- Ensure Twilio signature validation is passing

### Recordings not saving

- Verify recording is enabled in admin panel
- Check Twilio account has recording enabled
- Verify recording callback URL is accessible
- Check `recordingStatus` webhook is being called

### Extension routing not working

- Verify extension exists and is active in admin panel
- Check forwarding number is in E.164 format
- Ensure forwarding number is valid and reachable
- Check IVR timeout settings (default: 10 seconds)

### Business association not working

- Verify phone numbers in `UserResponse` match caller's number format
- Check phone normalization is working correctly
- Ensure `UserResponse` records exist with phone numbers

---

## Web-Based Dialer Setup

### 1. Configure Twilio API Key & Secret

For web-based calling (browser dialer), you need to create a Twilio API Key:

1. Go to Twilio Console → **Account** → **API Keys & Tokens**
2. Click **Create API Key**
3. Name it (e.g., "Web Dialer")
4. Copy the **API Key SID** and **API Secret** (secret only shown once!)
5. Go to `/admin/twilio` in your admin panel
6. Enter the **API Key** and **API Secret** in Twilio settings
7. Save settings

### 2. Create TwiML Application (Recommended)

For better Client SDK integration:

1. Go to Twilio Console → **Phone Numbers** → **Manage** → **TwiML Apps**
2. Click **Create new TwiML App**
3. Name it (e.g., "Call Center Dialer")
4. Set **Voice Configuration**:
   - **Request URL**: `https://YOUR_API_DOMAIN/api/twilio/outbound-bridge`
   - **Request Method**: `POST`
5. Save and copy the **Application SID**
6. (Optional) Update your code to use Application SID instead of URL

### 3. Use the Web Dialer

1. Navigate to `/admin/dialer` in your admin panel
2. The page will automatically connect to Twilio
3. Enter a phone number (E.164 format: +1234567890)
4. Click **Call** to make a call directly from your browser
5. Use **Mute** and **Speaker** controls during the call
6. Click **Hang Up** to end the call

### 4. Quick Dial from Call History

- Click the phone icon next to any call in `/admin/calls`
- This will open the dialer with that number pre-filled

---

## Production Checklist

- [ ] Twilio credentials configured in admin panel
- [ ] Twilio API Key & Secret configured (for web dialer)
- [ ] TwiML Application created (optional, recommended)
- [ ] Extensions created for all team members
- [ ] Webhooks configured in Twilio Console
- [ ] `API_BASE_URL` environment variable set
- [ ] Twilio signature validation enabled (automatic)
- [ ] Recording preferences configured
- [ ] Test inbound call flow
- [ ] Test outbound call flow (direct)
- [ ] Test web-based dialer (`/admin/dialer`)
- [ ] Verify call history appears in dashboard
- [ ] Verify recordings are accessible
- [ ] Monitor error logs for issues

---

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Verify Twilio webhook logs in Twilio Console
3. Test webhook endpoints manually with Twilio's webhook tester
4. Ensure all environment variables are set correctly
