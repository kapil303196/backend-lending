# MCA Lending API Backend

A complete REST API for managing MCA (Merchant Cash Advance) lending data with user response tracking.

## Features

- ✅ Full CRUD operations for MCA data
- ✅ Soft delete with `isActive` flag
- ✅ Query by MongoDB ID or custom `uniqueId`
- ✅ User response tracking and form submissions
- ✅ Automatic linking between MCA records and user responses
- ✅ Excel data import with checkpoint resume
- ✅ Built with Express.js and MongoDB/Mongoose

## Setup

### Prerequisites

- Node.js (v14 or higher)
- MongoDB database (local or Atlas)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
MONGO_DB=efilebusiness
COLLECTION_NAME=mca
PORT=5000
NODE_ENV=development
```

3. Import your data (optional):
```bash
# Using the new Mongoose model (recommended)
npm run import-model

# Or using the original raw MongoDB import
npm run import
```

4. Start the server:
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

The API will be available at `http://localhost:5000`

## API Endpoints

### MCA Endpoints

#### Get All MCA Records
```http
GET /api/mca
```

Query Parameters:
- `page` (number): Page number (default: 1)
- `limit` (number): Records per page (default: 50)
- `isActive` (boolean): Filter by active status
- `search` (string): Search by uniqueId
- `sortBy` (string): Field to sort by (default: createdAt)
- `sortOrder` (string): asc or desc (default: desc)

Example:
```bash
curl http://localhost:5000/api/mca?page=1&limit=10&isActive=true
```

#### Get MCA by ID or UniqueId
```http
GET /api/mca/:id
```

The `:id` parameter accepts either:
- MongoDB ObjectId (e.g., `507f1f77bcf86cd799439011`)
- Custom uniqueId (e.g., `A1B2C3D4`)

Query Parameters:
- `includeResponses` (boolean): Include linked user responses (default: true)

Example:
```bash
# By MongoDB ID
curl http://localhost:5000/api/mca/507f1f77bcf86cd799439011

# By uniqueId
curl http://localhost:5000/api/mca/A1B2C3D4
```

#### Create MCA Record
```http
POST /api/mca
```

Body (JSON):
```json
{
  "uniqueId": "ABC12345",
  "businessName": "Example Corp",
  "amount": "50000",
  "status": "pending",
  // ... any other fields from your Excel data
}
```

Note: If `uniqueId` is not provided, it will be auto-generated.

#### Update MCA Record
```http
PUT /api/mca/:id
PATCH /api/mca/:id
```

Body (JSON):
```json
{
  "status": "approved",
  "notes": "Updated information"
}
```

#### Soft Delete MCA Record
```http
DELETE /api/mca/:id
```

This sets `isActive = false` without permanently deleting the record.

#### Restore Soft Deleted MCA
```http
POST /api/mca/:id/restore
```

This sets `isActive = true` to restore a soft-deleted record.

#### Permanently Delete MCA
```http
DELETE /api/mca/:id/hard
```

⚠️ Warning: This permanently deletes the record and all associated user responses.

#### Get MCA Statistics
```http
GET /api/mca/stats
```

Returns statistics about MCA records (total, active, inactive, with responses).

### User Response Endpoints

#### Get All Responses
```http
GET /api/responses
```

Query Parameters:
- `page`, `limit`, `sortBy`, `sortOrder`: Same as MCA endpoints
- `status`: Filter by status (pending, submitted, approved, rejected)
- `mcaId`: Filter by MCA record ID
- `uniqueId`: Filter by uniqueId

#### Get Responses for Specific MCA
```http
GET /api/responses/mca/:id
```

The `:id` can be MongoDB ID or uniqueId of the MCA record.

#### Get Response by ID
```http
GET /api/responses/:id
```

#### Submit User Response
```http
POST /api/responses
```

Body (JSON):
```json
{
  "uniqueId": "ABC12345",
  "isVerified": true,
  "comments": "All information is correct",
  "formData": {
    "signature": "John Doe",
    "date": "2024-11-24"
  },
  "verifiedFields": [
    {
      "fieldName": "businessName",
      "isCorrect": true,
      "note": "Verified"
    },
    {
      "fieldName": "amount",
      "isCorrect": false,
      "correctedValue": "55000",
      "note": "Actual amount is higher"
    }
  ],
  "userContact": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234"
  },
  "status": "submitted"
}
```

This automatically:
1. Finds the MCA record by `uniqueId`
2. Creates the response linked to that MCA
3. Adds the response ID to the MCA's `userResponses` array

#### Update Response
```http
PUT /api/responses/:id
PATCH /api/responses/:id
```

#### Update Response Status
```http
PATCH /api/responses/:id/status
```

Body (JSON):
```json
{
  "status": "approved"
}
```

Valid statuses: `pending`, `submitted`, `approved`, `rejected`

#### Delete Response
```http
DELETE /api/responses/:id
```

This permanently deletes the response and removes it from the MCA's `userResponses` array.

#### Get Response Statistics
```http
GET /api/responses/stats
```

## Database Models

### MCA Model

```javascript
{
  uniqueId: String (required, unique, indexed),
  isActive: Boolean (default: true),
  userResponses: [ObjectId] (refs to UserResponse),
  // ... dynamic fields from Excel data
  createdAt: Date,
  updatedAt: Date
}
```

The model uses `strict: false` to allow dynamic fields from Excel imports.

### UserResponse Model

```javascript
{
  mcaId: ObjectId (required, refs to MCA),
  uniqueId: String (required, indexed),
  isVerified: Boolean,
  comments: String,
  formData: Mixed (flexible object),
  verifiedFields: [{
    fieldName: String,
    isCorrect: Boolean,
    correctedValue: String,
    note: String
  }],
  userContact: {
    name: String,
    email: String,
    phone: String
  },
  ipAddress: String,
  userAgent: String,
  status: String (enum: pending, submitted, approved, rejected),
  submittedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## User Flow

1. **Admin** imports MCA data using the import script
2. **Admin** sends user a link like: `https://yourapp.com/verify/{uniqueId}`
3. **User** visits the link and sees their MCA data
4. **User** verifies the information and submits the form
5. **API** creates a UserResponse record and links it to the MCA
6. **Admin** can view all responses and their status

## Import Scripts

### Using Mongoose Model (Recommended)
```bash
npm run import-model
```

Features:
- Uses Mongoose models with validation
- Supports checkpoint resume
- Handles duplicate uniqueId gracefully
- Better error reporting

### Using Raw MongoDB
```bash
npm run import
```

The original fast import script with parallel processing.

## Error Handling

All API responses follow this format:

Success:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

Error:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## Development

### Project Structure
```
backend-lending/
├── config/
│   └── database.js          # MongoDB connection
├── controllers/
│   ├── mcaController.js     # MCA business logic
│   └── userResponseController.js
├── models/
│   ├── MCA.js              # MCA schema
│   └── UserResponse.js     # User response schema
├── routes/
│   ├── mcaRoutes.js        # MCA endpoints
│   └── userResponseRoutes.js
├── scripts/
│   ├── import.js           # Raw MongoDB import
│   └── importWithModel.js  # Mongoose import
├── files/
│   └── data-24-nov.xlsx    # Sample data
├── server.js               # Express app
├── package.json
└── .env
```

### Adding New Features

1. Add fields to models if needed (or use dynamic fields)
2. Create controller methods in `controllers/`
3. Add routes in `routes/`
4. Update this README

## Security Considerations

- ⚠️ Add authentication middleware for production
- ⚠️ Add rate limiting
- ⚠️ Validate and sanitize all inputs
- ⚠️ Use HTTPS in production
- ⚠️ Set proper CORS origins

## License

MIT

## Support

For issues or questions, please contact the development team.

