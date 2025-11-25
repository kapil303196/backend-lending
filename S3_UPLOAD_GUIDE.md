# S3 File Upload Feature Guide

## Overview

This application now supports uploading bank statements and documents to AWS S3. Files are automatically uploaded during form submission, and their URLs are stored in the database.

## AWS Configuration

### Required Environment Variables

You **must** configure these settings in your `.env` file:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

## API Endpoints

### 1. Upload Single File

**Endpoint**: `POST /api/upload/single`

**Content-Type**: `multipart/form-data`

**Request**:
```bash
curl -X POST http://localhost:3000/api/upload/single \
  -F "file=@/path/to/statement.pdf"
```

**Response**:
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "url": "https://belowmsrp-images.s3.amazonaws.com/bank-statements/1234567890-abc123.pdf",
    "key": "bank-statements/1234567890-abc123.pdf",
    "originalName": "statement.pdf",
    "size": 245678,
    "mimeType": "application/pdf"
  }
}
```

### 2. Upload Multiple Files

**Endpoint**: `POST /api/upload/multiple`

**Content-Type**: `multipart/form-data`

**Request**:
```bash
curl -X POST http://localhost:3000/api/upload/multiple \
  -F "bankStatements=@/path/to/statement1.pdf" \
  -F "bankStatements=@/path/to/statement2.pdf" \
  -F "bankStatements=@/path/to/statement3.pdf"
```

**Response**:
```json
{
  "success": true,
  "message": "3 file(s) uploaded successfully",
  "data": [
    {
      "url": "https://belowmsrp-images.s3.amazonaws.com/bank-statements/1234567890-abc123.pdf",
      "key": "bank-statements/1234567890-abc123.pdf",
      "originalName": "statement1.pdf",
      "size": 245678,
      "mimeType": "application/pdf"
    },
    ...
  ]
}
```

### 3. Delete File

**Endpoint**: `DELETE /api/upload/delete`

**Content-Type**: `application/json`

**Request**:
```bash
curl -X DELETE http://localhost:3000/api/upload/delete \
  -H "Content-Type: application/json" \
  -d '{"key": "bank-statements/1234567890-abc123.pdf"}'
```

**Response**:
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

## File Upload Rules

### Accepted File Types
- PDF (`.pdf`)
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)

### File Size Limits
- **Maximum per file**: 10 MB
- **Maximum files**: 3 bank statements

### File Naming
Files are automatically renamed using this pattern:
```
bank-statements/{timestamp}-{random-hash}{extension}
```

Example: `bank-statements/1700123456789-a1b2c3d4e5f6g7h8.pdf`

## Database Storage

When a user submits a response, the uploaded files are stored in the `bankStatements` array:

```javascript
{
  "_id": "...",
  "uniqueId": "F644933B",
  "bankStatements": [
    {
      "url": "https://belowmsrp-images.s3.amazonaws.com/bank-statements/...",
      "key": "bank-statements/1234567890-abc123.pdf",
      "originalName": "statement.pdf",
      "size": 245678,
      "uploadedAt": "2024-11-24T10:30:00.000Z"
    }
  ],
  ...
}
```

## Frontend Integration

### Upload Process

1. **User selects files** in Step 4 (Documents)
2. **Files are validated** (type, size)
3. **On form submission**, files are uploaded to S3
4. **S3 URLs are included** in the response submission
5. **URLs are stored** in the database

### Example Frontend Code

```typescript
// Upload files
const uploadResult = await uploadFiles(files)

// Submit response with S3 URLs
const responseData = {
  uniqueId: 'F644933B',
  bankStatements: uploadResult.data.map(file => ({
    url: file.url,
    key: file.key,
    originalName: file.originalName,
    size: file.size
  })),
  ...otherData
}

await submitResponse(responseData)
```

## Error Handling

### Common Errors

1. **File too large**
```json
{
  "success": false,
  "message": "File size too large. Maximum size is 10MB per file."
}
```

2. **Invalid file type**
```json
{
  "success": false,
  "message": "Invalid file type. Only PDF, JPG, and PNG files are allowed."
}
```

3. **Too many files**
```json
{
  "success": false,
  "message": "Too many files. Maximum is 3 files."
}
```

4. **S3 Upload Error**
```json
{
  "success": false,
  "message": "Failed to upload file to S3: Access Denied"
}
```

## Testing

### Test Single Upload
```bash
# Create a test file
echo "Test content" > test.pdf

# Upload it
curl -X POST http://localhost:3000/api/upload/single \
  -F "file=@test.pdf"
```

### Test Multiple Upload
```bash
curl -X POST http://localhost:3000/api/upload/multiple \
  -F "bankStatements=@test1.pdf" \
  -F "bankStatements=@test2.pdf"
```

### Test with Form Submission
```bash
# First upload files
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:3000/api/upload/multiple \
  -F "bankStatements=@test1.pdf")

# Extract URLs and submit response
curl -X POST http://localhost:3000/api/responses \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueId": "F644933B",
    "bankStatements": [...from upload response...],
    "status": "submitted"
  }'
```

## Security Considerations

1. **Public Read Access**: Files are uploaded with `public-read` ACL, making them publicly accessible via URL
2. **Credentials**: AWS credentials are currently in code but should be moved to environment variables for production
3. **File Validation**: Only specific file types are allowed
4. **Size Limits**: Enforced at 10MB per file
5. **Unique Names**: Files are renamed to prevent overwriting

## Production Checklist

- [ ] Move AWS credentials to environment variables
- [ ] Set up IAM user with S3-only permissions
- [ ] Configure bucket CORS for production domain
- [ ] Set up CloudFront CDN for faster delivery
- [ ] Implement file virus scanning
- [ ] Add logging and monitoring
- [ ] Set up S3 lifecycle rules for old files
- [ ] Consider private files with signed URLs

## Troubleshooting

### Files not uploading
1. Check AWS credentials are correct
2. Verify S3 bucket exists and is accessible
3. Check bucket permissions (PutObject, GetObject)
4. Verify CORS settings allow your domain

### Files uploading but URLs not working
1. Check bucket ACL settings
2. Verify files have `public-read` permission
3. Check bucket policy allows public access

### Database not storing URLs
1. Verify UserResponse model includes `bankStatements` field
2. Check response controller is parsing bank statements correctly
3. Verify frontend is sending correct data structure

## Support

For issues or questions:
- Check server logs: `npm run dev` output
- Review S3 bucket in AWS Console
- Check MongoDB data structure
- Contact: sales@funddirect.us

---

**Last Updated**: November 24, 2024

