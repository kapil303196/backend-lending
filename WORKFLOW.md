# MCA Lending - Complete Workflow

This document explains the complete workflow from data import to user response collection.

## Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────────┐
│   Import    │─────▶│  MCA Record  │─────▶│ Send Link   │─────▶│ User Submits │
│  Excel Data │      │  w/ uniqueId │      │  to User    │      │   Response   │
└─────────────┘      └──────────────┘      └─────────────┘      └──────────────┘
                            │                                            │
                            │                                            │
                            └────────────── Linked ─────────────────────┘
```

## Phase 1: Data Import

### Step 1.1: Prepare Excel File

Place your Excel file in the `files/` directory:
```
backend-lending/files/data-24-nov.xlsx
```

The Excel file can have any columns. Common columns might be:
- Business Name
- Contact Person
- Amount
- Status
- Phone
- Email
- Address
- etc.

### Step 1.2: Run Import Script

```bash
npm run import-model
```

What happens:
1. ✅ Script reads Excel file
2. ✅ Converts column names to camelCase (e.g., "Business Name" → "businessName")
3. ✅ Cleans data (removes "Undefined", "Unknown", empty values)
4. ✅ Generates unique `uniqueId` for each record (8 character hex: ABC12345)
5. ✅ Sets `isActive = true` by default
6. ✅ Saves to MongoDB with timestamps

### Step 1.3: Verify Import

```bash
curl http://localhost:5000/api/mca/stats
```

Expected response:
```json
{
  "success": true,
  "data": {
    "total": 1000,
    "active": 1000,
    "inactive": 0,
    "withResponses": 0,
    "responseRate": "0.00"
  }
}
```

## Phase 2: Send Links to Users

### Step 2.1: Get Record and uniqueId

```bash
curl http://localhost:5000/api/mca?limit=1
```

Response includes:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "uniqueId": "A1B2C3D4",
      "businessName": "Example Corp",
      "contactPerson": "John Doe",
      "amount": "50000",
      "isActive": true,
      "userResponses": [],
      "createdAt": "2024-11-24T10:00:00.000Z",
      "updatedAt": "2024-11-24T10:00:00.000Z"
    }
  ]
}
```

### Step 2.2: Generate Verification Link

For each record, create a link:
```
https://yourfrontend.com/verify/A1B2C3D4
```

The `uniqueId` is used in the URL so users can't guess other records' URLs easily.

### Step 2.3: Send Link to User

Send via:
- Email
- SMS
- Portal notification
- etc.

Example email:
```
Subject: Please verify your information

Hi John,

Please review and verify your information by clicking the link below:

https://yourfrontend.com/verify/A1B2C3D4

This link is unique to you and contains the information we have on file.

Thank you!
```

## Phase 3: User Views and Verifies Data

### Step 3.1: Frontend Fetches Data

When user clicks the link, your frontend calls:

```javascript
const response = await fetch(`http://localhost:5000/api/mca/A1B2C3D4`);
const { data } = await response.json();
```

### Step 3.2: Display Data to User

Show all the information from the MCA record:

```jsx
<div className="verification-form">
  <h2>Please verify your information</h2>
  
  <div className="info-section">
    <h3>Business Information</h3>
    <p>Business Name: {data.businessName}</p>
    <p>Contact Person: {data.contactPerson}</p>
    <p>Amount: ${data.amount}</p>
    {/* ... display all other fields ... */}
  </div>
  
  <div className="verification-section">
    <label>
      <input type="checkbox" />
      I confirm this information is correct
    </label>
    
    <textarea 
      placeholder="Any corrections or comments?"
    />
  </div>
  
  <button>Submit Verification</button>
</div>
```

### Step 3.3: User Submits Response

When user clicks submit, frontend sends:

```javascript
const response = await fetch('http://localhost:5000/api/responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uniqueId: 'A1B2C3D4',
    isVerified: true,
    comments: 'All information is correct',
    formData: {
      signature: 'John Doe',
      signatureDate: '2024-11-24',
      acknowledgedTerms: true
    },
    verifiedFields: [
      {
        fieldName: 'businessName',
        isCorrect: true,
        note: 'Correct'
      },
      {
        fieldName: 'amount',
        isCorrect: false,
        correctedValue: '55000',
        note: 'Amount should be $55,000'
      }
    ],
    userContact: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234'
    },
    status: 'submitted'
  })
});
```

## Phase 4: Backend Processing

### Step 4.1: API Receives Response

The `/api/responses` endpoint:
1. ✅ Validates the uniqueId exists
2. ✅ Checks if MCA record is active
3. ✅ Creates UserResponse document
4. ✅ Links it to MCA record (stores mcaId)
5. ✅ Adds response ID to MCA's userResponses array
6. ✅ Captures IP address and user agent
7. ✅ Sets submission timestamp

### Step 4.2: Data is Linked

After submission, the MCA record looks like:

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "uniqueId": "A1B2C3D4",
  "businessName": "Example Corp",
  "userResponses": [
    "507f1f77bcf86cd799439022"  // ← UserResponse ID added here
  ],
  ...
}
```

And the UserResponse looks like:

```json
{
  "_id": "507f1f77bcf86cd799439022",
  "mcaId": "507f1f77bcf86cd799439011",  // ← Links back to MCA
  "uniqueId": "A1B2C3D4",
  "isVerified": true,
  "comments": "All information is correct",
  "status": "submitted",
  "submittedAt": "2024-11-24T11:30:00.000Z",
  ...
}
```

## Phase 5: Admin Review

### Step 5.1: View All Responses

Admin dashboard calls:

```bash
curl http://localhost:5000/api/responses?status=submitted
```

### Step 5.2: View Specific MCA with All Responses

```bash
curl http://localhost:5000/api/mca/A1B2C3D4?includeResponses=true
```

This returns the MCA record with populated userResponses.

### Step 5.3: Approve or Reject

```bash
curl -X PATCH http://localhost:5000/api/responses/507f1f77bcf86cd799439022/status \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'
```

## Complete Data Flow Example

### 1. Import Data
```bash
npm run import-model
# Result: 1000 MCA records created
```

### 2. Get first record
```bash
curl http://localhost:5000/api/mca?limit=1
# Response: uniqueId = "A1B2C3D4"
```

### 3. User visits link
```
https://yourapp.com/verify/A1B2C3D4
```

### 4. Frontend fetches data
```javascript
GET /api/mca/A1B2C3D4
```

### 5. User submits form
```javascript
POST /api/responses
Body: { uniqueId: "A1B2C3D4", ... }
```

### 6. Backend processes
- Creates UserResponse
- Links to MCA record
- Response ID added to MCA.userResponses[]

### 7. Admin reviews
```javascript
GET /api/mca/A1B2C3D4
// Returns MCA with userResponses array populated
```

### 8. Admin approves
```javascript
PATCH /api/responses/:id/status
Body: { status: "approved" }
```

## Database Relationships

```
MCA Collection
┌────────────────────────────────┐
│ _id: ObjectId                  │
│ uniqueId: "A1B2C3D4"           │
│ businessName: "Example Corp"   │
│ isActive: true                 │
│ userResponses: [               │◄────┐
│   ObjectId("..."),             │     │
│   ObjectId("...")              │     │ References
│ ]                              │     │
└────────────────────────────────┘     │
                                       │
UserResponse Collection                │
┌────────────────────────────────┐     │
│ _id: ObjectId                  │─────┘
│ mcaId: ObjectId (refs MCA)     │◄────── Reference back
│ uniqueId: "A1B2C3D4"           │
│ status: "submitted"            │
│ formData: { ... }              │
│ submittedAt: Date              │
└────────────────────────────────┘
```

## Soft Delete Workflow

### Deactivate a Record
```bash
DELETE /api/mca/A1B2C3D4
# Sets isActive = false
```

### Query only active records
```bash
GET /api/mca?isActive=true
```

### Restore a record
```bash
POST /api/mca/A1B2C3D4/restore
# Sets isActive = true
```

### Permanently delete
```bash
DELETE /api/mca/A1B2C3D4/hard
# Deletes MCA and all linked UserResponses
```

## Summary

| Phase | Action | Endpoint | Result |
|-------|--------|----------|--------|
| 1 | Import data | `npm run import-model` | MCA records created |
| 2 | Get uniqueId | `GET /api/mca` | Retrieve uniqueId |
| 3 | Send link | External | User receives link |
| 4 | User views | `GET /api/mca/:uniqueId` | Display data |
| 5 | User submits | `POST /api/responses` | Response linked |
| 6 | Admin reviews | `GET /api/responses` | View submissions |
| 7 | Admin approves | `PATCH /api/responses/:id/status` | Update status |

This workflow ensures:
- ✅ Data integrity with proper linking
- ✅ User privacy with unique IDs
- ✅ Complete audit trail
- ✅ Flexible response tracking
- ✅ Soft delete for data retention

