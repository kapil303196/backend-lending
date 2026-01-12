# Unsubscribe System Guide

## Overview

The unsubscribe system allows users to opt-out of marketing emails with a single click. Unsubscribed emails are stored in the database and can be exported for use by the email team.

## User Unsubscribe Flow

### One-Click Unsubscribe Link

Users can unsubscribe by clicking a link in their email:
```
https://heroicfunding.com/unsubscribe?email=user@example.com
```

The system will:
1. Automatically process the unsubscribe when the page loads
2. Store the email in the database
3. Show a success message to the user
4. No confirmation or additional clicks required

## API Endpoints

### Unsubscribe (Public)
```http
GET /api/unsubscribe?email=user@example.com
POST /api/unsubscribe
Content-Type: application/json
{
  "email": "user@example.com"
}
```

### Check Unsubscribe Status
```http
GET /api/unsubscribe/check?email=user@example.com
```

### Download Unsubscribed List (Protected)

**Important**: This endpoint requires a secret key, not authentication.

```http
GET /api/unsubscribe/list?secret=YOUR_SECRET_KEY
```

Or using a header:
```http
GET /api/unsubscribe/list
X-Unsubscribe-Secret: YOUR_SECRET_KEY
```

**Response**: Returns a text file (`unsubscribed-emails.txt`) with one email address per line.

## Configuration

### Environment Variable

Add the following to your `.env` file:

```env
UNSUBSCRIBE_LIST_SECRET=your-secret-key-here
```

**Security Note**: 
- Use a strong, random secret key
- Don't commit the secret to version control
- Share the secret only with authorized email team members
- If no secret is set, the default is `change-this-secret-key` (change this in production!)

### Example Usage

```bash
# Download the unsubscribed list
curl "https://your-api.com/api/unsubscribe/list?secret=your-secret-key-here" -o unsubscribed-emails.txt

# Or using header
curl -H "X-Unsubscribe-Secret: your-secret-key-here" \
     "https://your-api.com/api/unsubscribe/list" \
     -o unsubscribed-emails.txt
```

## Database Model

Unsubscribed emails are stored in the `UnsubscribedEmail` collection with:
- `email` (unique, indexed)
- `unsubscribedAt` (timestamp)
- `ipAddress` (for tracking)
- `userAgent` (for tracking)
- `createdAt`, `updatedAt` (automatic timestamps)

## Email Team Workflow

1. Before sending marketing emails, download the unsubscribe list:
   ```bash
   curl "https://your-api.com/api/unsubscribe/list?secret=YOUR_SECRET" -o unsubscribed.txt
   ```

2. Filter your email list to exclude addresses in `unsubscribed.txt`

3. Send emails only to addresses not in the unsubscribe list

## Security Considerations

- The `/api/unsubscribe/list` endpoint is protected by a secret key
- The secret should be strong and kept confidential
- Consider rotating the secret periodically
- Monitor access to the endpoint for suspicious activity
