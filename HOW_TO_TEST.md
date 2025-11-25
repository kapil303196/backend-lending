# 🧪 How to Test the API

## Two Ways to Test

You have **two powerful tools** to test your API:

### 1. 🔷 Swagger UI (Interactive Documentation)
- **URL**: http://localhost:5000/api-docs
- **Best for**: Quick testing, learning the API
- **Setup**: None! Just start the server

### 2. 📦 Postman Collection
- **File**: `MCA_Lending_API.postman_collection.json`
- **Best for**: Professional testing, automated workflows
- **Setup**: Import into Postman app

---

## 🔷 Swagger UI - Quick Start

### Step 1: Start Server
```bash
npm run dev
```

### Step 2: Open Swagger
Open your browser to:
```
http://localhost:5000/api-docs
```

### Step 3: Test an Endpoint
1. Click on any endpoint (e.g., `GET /health`)
2. Click "Try it out"
3. Click "Execute"
4. See the response!

**That's it!** No installation, no configuration needed.

---

## 📦 Postman - Quick Start

### Step 1: Import Collection
1. Open Postman
2. Click "Import"
3. Drag `MCA_Lending_API.postman_collection.json` into Postman

### Step 2: Start Server
```bash
npm run dev
```

### Step 3: Test
1. Open "Complete Workflow Example" folder
2. Run "Step 1 - Create Test MCA"
3. Continue with Steps 2, 3, 4, 5

**Variables are auto-saved!** Each step feeds data to the next.

---

## 🎯 What to Test

### Basic Functionality ✅
- [ ] Server health check
- [ ] Get all MCA records
- [ ] Get statistics
- [ ] Create a record
- [ ] Get record by uniqueId
- [ ] Update a record

### User Response Flow ✅
- [ ] Submit a user response
- [ ] Verify response is linked to MCA
- [ ] Update response status
- [ ] Get all responses for an MCA

### Advanced Features ✅
- [ ] Soft delete (isActive = false)
- [ ] Restore soft deleted record
- [ ] Pagination (page, limit)
- [ ] Filtering (isActive, status)
- [ ] Sorting (sortBy, sortOrder)

---

## 🚀 Complete Test Workflow

This tests the entire system end-to-end:

### Using Swagger UI:

1. **GET** `/api/mca/stats` → See totals
2. **POST** `/api/mca` → Create record (copy uniqueId)
3. **GET** `/api/mca/{uniqueId}` → Verify creation
4. **POST** `/api/responses` → Submit user response
5. **GET** `/api/mca/{uniqueId}` → Verify link (check userResponses array)
6. **PATCH** `/api/responses/{id}/status` → Approve response
7. **DELETE** `/api/mca/{uniqueId}` → Soft delete
8. **POST** `/api/mca/{uniqueId}/restore` → Restore

### Using Postman:

Just run the "Complete Workflow Example" folder! 
All steps are automated with auto-saved variables.

---

## 📋 Quick Reference

### All Available Endpoints

#### MCA Endpoints
```
GET    /api/mca              - Get all records
GET    /api/mca/stats        - Get statistics
GET    /api/mca/:id          - Get by ID or uniqueId
POST   /api/mca              - Create record
PUT    /api/mca/:id          - Update record
DELETE /api/mca/:id          - Soft delete
POST   /api/mca/:id/restore  - Restore
DELETE /api/mca/:id/hard     - Hard delete (permanent)
```

#### User Response Endpoints
```
GET    /api/responses            - Get all responses
GET    /api/responses/stats      - Get statistics
GET    /api/responses/mca/:id    - Get responses for MCA
GET    /api/responses/:id        - Get by ID
POST   /api/responses            - Submit response
PUT    /api/responses/:id        - Update response
PATCH  /api/responses/:id/status - Update status
DELETE /api/responses/:id        - Delete response
```

---

## 🎨 Example Requests

### Create MCA Record
```json
POST /api/mca
{
  "businessName": "Example Corp",
  "contactPerson": "John Doe",
  "email": "john@example.com",
  "phone": "555-1234",
  "amount": "50000",
  "status": "pending"
}
```

### Submit User Response
```json
POST /api/responses
{
  "uniqueId": "A1B2C3D4",
  "isVerified": true,
  "comments": "All information is correct",
  "userContact": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-1234"
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
      "note": "Amount should be higher"
    }
  ],
  "status": "submitted"
}
```

---

## ✅ Success Indicators

You'll know everything is working when:

1. ✅ Server starts without errors
2. ✅ Swagger UI loads at http://localhost:5000/api-docs
3. ✅ Health check returns `{ "success": true }`
4. ✅ You can create a record
5. ✅ You can get that record back
6. ✅ You can submit a response
7. ✅ Response ID appears in MCA's `userResponses` array

---

## 🐛 Troubleshooting

### Server Won't Start
```bash
# Check if .env file exists
ls -la .env

# Make sure it has:
# MONGODB_URI=your_connection_string
# MONGO_DB=efilebusiness
```

### Swagger Shows Empty
```bash
# Clear browser cache
# Or open in incognito mode
```

### Postman Connection Failed
```bash
# Check server is running
curl http://localhost:5000/health

# Check baseUrl variable in Postman
# Should be: http://localhost:5000
```

### MongoDB Connection Error
```bash
# Verify MongoDB URI in .env
# Make sure IP is whitelisted in MongoDB Atlas
# Check username/password are correct
```

---

## 📚 Detailed Guides

Need more help? Check these guides:

- **`TEST_NOW.md`** - 30-second quick start
- **`TESTING_GUIDE.md`** - Complete testing guide (both tools)
- **`POSTMAN_SETUP.md`** - Detailed Postman setup
- **`API_EXAMPLES.md`** - Code examples (cURL, JS, Python, React)
- **`WORKFLOW.md`** - Understand the complete workflow

---

## 🎓 Learning Path

1. **Start Here**: Use Swagger UI to explore
2. **Try Basic Operations**: Create, read, update
3. **Test Workflow**: Create → Submit → Approve
4. **Advanced Testing**: Use Postman for automation
5. **Build Frontend**: Integrate with your app

---

## 🎯 Testing Checklist

Print this out and check off as you test:

### Basic Tests
- [ ] Health check works
- [ ] Can get all MCA records
- [ ] Can get statistics
- [ ] Can create a record
- [ ] Can get record by uniqueId
- [ ] Can update a record

### Response Flow
- [ ] Can submit a response
- [ ] Response links to MCA correctly
- [ ] Can get all responses
- [ ] Can update response status
- [ ] Can get responses for specific MCA

### Soft Delete
- [ ] Can soft delete (isActive = false)
- [ ] Soft deleted record is still accessible
- [ ] Can restore soft deleted record
- [ ] Can query only active records

### Filtering & Pagination
- [ ] Pagination works (page, limit)
- [ ] Can filter by isActive
- [ ] Can filter by status
- [ ] Can sort results

---

## 💡 Pro Tips

1. **Start with Swagger** - It's the easiest way to learn
2. **Use Postman for workflows** - Better for sequential testing
3. **Check the Console** - Server logs show all requests
4. **Save examples** - Document working requests for your team
5. **Test incrementally** - Don't skip steps in the workflow

---

## 🎉 You're Ready!

Choose your tool and start testing:

- **🔷 Swagger UI**: http://localhost:5000/api-docs
- **📦 Postman**: Import `MCA_Lending_API.postman_collection.json`

Both tools are fully configured and ready to use!

**Happy Testing!** 🚀

