# Quick Start Guide

Get your MCA Lending API up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
cd backend-lending
npm install
```

## Step 2: Configure Environment

Create a `.env` file in the root directory:

```env
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/your-database?retryWrites=true&w=majority
MONGO_DB=efilebusiness
COLLECTION_NAME=mca
PORT=5000
NODE_ENV=development
```

**Important:** Replace the MongoDB connection string with your actual credentials!

## Step 3: Import Data (Optional)

If you have Excel data to import:

```bash
# Make sure your Excel file is in the files/ directory
npm run import-model
```

This will:
- Read the Excel file
- Transform the data
- Import into MongoDB
- Generate unique IDs for each record

## Step 4: Start the Server

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```

You should see:

```
✅ MongoDB Connected: cluster0.xxxxx.mongodb.net
📊 Database: efilebusiness
🚀 Server is running on port 5000
```

## Step 5: Test the API

Open your browser or use curl:

```bash
# Health check
curl http://localhost:5000/health

# Get all MCA records
curl http://localhost:5000/api/mca?limit=5

# Get statistics
curl http://localhost:5000/api/mca/stats
```

## Step 6: Test User Response Flow

1. Get a uniqueId from your MCA records:
```bash
curl http://localhost:5000/api/mca?limit=1
# Copy the uniqueId from the response
```

2. Submit a user response:
```bash
curl -X POST http://localhost:5000/api/responses \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueId": "YOUR_UNIQUE_ID_HERE",
    "isVerified": true,
    "comments": "Test response",
    "userContact": {
      "name": "Test User",
      "email": "test@example.com"
    },
    "status": "submitted"
  }'
```

3. Verify the response was linked:
```bash
curl http://localhost:5000/api/mca/YOUR_UNIQUE_ID_HERE
# Check the userResponses array
```

## Common Issues

### MongoDB Connection Failed

- Check your MONGODB_URI in `.env`
- Ensure your IP is whitelisted in MongoDB Atlas
- Verify username and password are correct

### Port Already in Use

Change the PORT in your `.env` file:
```env
PORT=3000
```

### Import Fails

- Ensure the Excel file path is correct in `scripts/importWithModel.js`
- Check if MongoDB connection is working
- Look for duplicate uniqueId values

## Next Steps

1. **Read the full documentation**: See [README.md](README.md)
2. **Explore API examples**: See [API_EXAMPLES.md](API_EXAMPLES.md)
3. **Build your frontend**: Use the API endpoints to create a user interface
4. **Add authentication**: Implement JWT or OAuth for security
5. **Deploy**: Deploy to Heroku, AWS, or your preferred hosting

## Project Structure

```
backend-lending/
├── config/
│   └── database.js          # MongoDB connection
├── controllers/
│   ├── mcaController.js     # MCA business logic
│   └── userResponseController.js
├── models/
│   ├── MCA.js              # MCA schema
│   └── UserResponse.js
├── routes/
│   ├── mcaRoutes.js
│   └── userResponseRoutes.js
├── middleware/
│   └── validation.js       # Request validation
├── utils/
│   └── helpers.js          # Utility functions
├── scripts/
│   ├── import.js           # Fast import
│   └── importWithModel.js  # Model-based import
├── server.js               # Main entry point
└── .env                    # Environment config
```

## Key Features

✅ Full CRUD operations
✅ Soft delete with `isActive`
✅ Query by MongoDB ID or uniqueId
✅ User response tracking
✅ Automatic linking between records
✅ Pagination and filtering
✅ Statistics endpoints

## Support

For help, check:
- [README.md](README.md) - Full documentation
- [API_EXAMPLES.md](API_EXAMPLES.md) - Usage examples

Happy coding! 🚀

