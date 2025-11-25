# API Testing Guide

This guide will help you test the MCA Lending API using either Postman or Swagger UI.

## 🎯 Choose Your Tool

You have **two options** to test the API:

1. **Swagger UI** (Browser-based, built-in) ⭐ Recommended for quick testing
2. **Postman** (Desktop app, more powerful) ⭐ Recommended for automated workflows

## 🔷 Option 1: Swagger UI (Interactive Browser-based Testing)

### Setup

1. **Start the server:**
```bash
npm run dev
```

2. **Open Swagger UI in your browser:**
```
http://localhost:5000/api-docs
```

3. **You should see a beautiful interactive API documentation!**

### Features

✅ Interactive "Try it out" buttons  
✅ Automatic request/response examples  
✅ Schema documentation  
✅ No installation required  
✅ Works directly in browser  

### How to Use Swagger UI

#### 1. **Health Check Test**

- Click on `GET /health` under the "Health" section
- Click "Try it out"
- Click "Execute"
- See the response below!

#### 2. **Get All MCA Records**

- Click on `GET /api/mca` under "MCA" section
- Click "Try it out"
- Modify parameters:
  - `page`: 1
  - `limit`: 10
  - `isActive`: true
- Click "Execute"
- Copy a `uniqueId` from the response for next tests

#### 3. **Get Single MCA**

- Click on `GET /api/mca/{id}`
- Click "Try it out"
- Paste the `uniqueId` in the `id` field
- Click "Execute"
- You'll see the full MCA record with all details

#### 4. **Submit User Response**

- Click on `POST /api/responses`
- Click "Try it out"
- Modify the request body (replace `A1B2C3D4` with your actual uniqueId):

```json
{
  "uniqueId": "A1B2C3D4",
  "isVerified": true,
  "comments": "Testing via Swagger!",
  "userContact": {
    "name": "Test User",
    "email": "test@example.com",
    "phone": "555-1234"
  },
  "status": "submitted"
}
```

- Click "Execute"
- Response will show the created response with ID

#### 5. **Verify Response Was Linked**

- Go back to `GET /api/mca/{id}`
- Use the same uniqueId
- Click "Execute"
- Check the `userResponses` array - it should now have the response ID!

### Swagger Tips

💡 **Tip 1**: Use the "Schemas" section at the bottom to see all data models  
💡 **Tip 2**: Responses show both the data structure and example values  
💡 **Tip 3**: All parameters are documented with descriptions  
💡 **Tip 4**: Errors show helpful messages with status codes  

---

## 📦 Option 2: Postman (Professional API Testing)

### Setup

1. **Download Postman** (if you don't have it):
   - Go to: https://www.postman.com/downloads/
   - Install and launch Postman

2. **Import the Collection:**
   - Click "Import" in Postman (top-left)
   - Drag and drop `MCA_Lending_API.postman_collection.json`
   - Or click "Upload Files" and select the file
   - The collection will appear in your left sidebar

3. **Set the base URL** (should be automatic):
   - The collection has a variable `{{baseUrl}}` set to `http://localhost:5000`
   - You can change it in Collection Variables if needed

### Collection Structure

```
MCA Lending API/
├── Health & Info/
│   ├── Health Check
│   └── Root Info
├── MCA Records/
│   ├── Get All MCA Records
│   ├── Get MCA by ID or UniqueId
│   ├── Get MCA Statistics
│   ├── Create MCA Record
│   ├── Update MCA Record
│   ├── Soft Delete MCA
│   ├── Restore MCA
│   └── Hard Delete MCA (Permanent)
├── User Responses/
│   ├── Get All Responses
│   ├── Get Responses for Specific MCA
│   ├── Get Response by ID
│   ├── Get Response Statistics
│   ├── Submit User Response
│   ├── Update Response
│   ├── Update Response Status
│   └── Delete Response
└── Complete Workflow Example/
    ├── Step 1 - Create Test MCA
    ├── Step 2 - Get MCA Details
    ├── Step 3 - User Submits Response
    ├── Step 4 - Verify Response Linked
    └── Step 5 - Approve Response
```

### Quick Start with Postman

#### **Test the Complete Workflow** (Easiest!)

The collection includes an automated workflow. Just run these in order:

1. Open "Complete Workflow Example" folder
2. Click on "Step 1 - Create Test MCA"
3. Click "Send"
4. Continue with Step 2, 3, 4, 5 in order
5. Each step automatically saves variables for the next step!

Watch the console (bottom) for success messages like:
```
✅ Step 1 Complete: MCA created with uniqueId: A1B2C3D4
✅ Step 2 Complete: MCA retrieved
✅ Step 3 Complete: Response submitted
✅ Step 4 Complete: Response linked to MCA
✅ Step 5 Complete: Response approved!
🎉 Workflow completed successfully!
```

#### **Individual Endpoint Testing**

1. **Health Check:**
   - Go to "Health & Info" → "Health Check"
   - Click "Send"
   - Should return 200 OK

2. **Get All MCA Records:**
   - Go to "MCA Records" → "Get All MCA Records"
   - Modify query params if needed (page, limit, isActive)
   - Click "Send"
   - Copy a `uniqueId` from the response

3. **Get Specific MCA:**
   - Go to "MCA Records" → "Get MCA by ID or UniqueId"
   - Replace `{{uniqueId}}` in the URL with your actual uniqueId
   - Or set the collection variable (see below)
   - Click "Send"

4. **Create MCA:**
   - Go to "MCA Records" → "Create MCA Record"
   - Modify the JSON body if needed
   - Click "Send"
   - The `uniqueId` and `mcaId` are auto-saved to variables!

5. **Submit Response:**
   - Go to "User Responses" → "Submit User Response"
   - Make sure `{{uniqueId}}` variable is set
   - Modify the body if needed
   - Click "Send"

### Collection Variables (Auto-Saved!)

The collection automatically saves these variables as you test:

- `baseUrl`: Server URL (default: http://localhost:5000)
- `uniqueId`: Last used uniqueId
- `mcaId`: Last used MongoDB ID
- `responseId`: Last created response ID

**To view/edit variables:**
1. Click on the collection name
2. Go to "Variables" tab
3. See current values
4. Edit if needed

### Postman Features

✅ **Auto-save variables**: IDs are saved automatically  
✅ **Pre-filled examples**: All requests have working examples  
✅ **Test scripts**: Automatic validation and logging  
✅ **Collections**: Organized by feature  
✅ **Environment support**: Switch between dev/staging/prod  
✅ **Save responses**: Keep history of all calls  
✅ **Share**: Export and share with team  

### Postman Tips

💡 **Tip 1**: Use the "Complete Workflow Example" to test end-to-end  
💡 **Tip 2**: Check the Console (View → Show Postman Console) for detailed logs  
💡 **Tip 3**: Use Collections Runner to run multiple requests  
💡 **Tip 4**: Create environments for different servers (dev/staging/prod)  
💡 **Tip 5**: Use "Save Response" to keep examples for documentation  

---

## 🎯 Testing Scenarios

### Scenario 1: Create and Verify Data

**Swagger:**
1. POST `/api/mca` - Create record
2. GET `/api/mca/{id}` - Verify it exists
3. GET `/api/mca/stats` - Check totals

**Postman:**
1. Run "Create MCA Record"
2. Run "Get MCA by ID or UniqueId"
3. Run "Get MCA Statistics"

### Scenario 2: Complete User Response Flow

**Swagger:**
1. GET `/api/mca` - Get a record
2. POST `/api/responses` - Submit response
3. GET `/api/mca/{id}` - Verify link
4. PATCH `/api/responses/{id}/status` - Approve

**Postman:**
- Simply run the "Complete Workflow Example" folder!

### Scenario 3: Test Soft Delete

**Swagger:**
1. GET `/api/mca/{id}` - Get a record
2. DELETE `/api/mca/{id}` - Soft delete
3. GET `/api/mca/{id}` - Still accessible
4. POST `/api/mca/{id}/restore` - Restore
5. GET `/api/mca/{id}` - Verify restored

**Postman:**
1. "Get MCA by ID or UniqueId"
2. "Soft Delete MCA"
3. "Get MCA by ID or UniqueId"
4. "Restore MCA"
5. "Get MCA by ID or UniqueId"

### Scenario 4: Pagination and Filtering

**Swagger:**
1. GET `/api/mca?page=1&limit=5`
2. GET `/api/mca?isActive=true`
3. GET `/api/mca?sortBy=createdAt&sortOrder=asc`

**Postman:**
- Modify query params in "Get All MCA Records"
- Save different variations

---

## 🔍 Comparing the Tools

| Feature | Swagger UI | Postman |
|---------|-----------|---------|
| **Installation** | None (built-in) | Download required |
| **Ease of Use** | Very easy | Easy |
| **Documentation** | Excellent | Manual |
| **Variables** | Manual entry | Auto-save |
| **Workflows** | Manual | Automated |
| **Team Sharing** | URL only | Export/Import |
| **History** | No | Yes |
| **Environments** | No | Yes |
| **Best For** | Quick testing | Professional use |

### When to Use Swagger

✅ Quick API exploration  
✅ Learning the API  
✅ Sharing documentation  
✅ Simple one-off tests  
✅ No setup needed  

### When to Use Postman

✅ Professional testing  
✅ Automated workflows  
✅ Multiple environments  
✅ Team collaboration  
✅ Complex test scenarios  
✅ API development  

---

## 🎓 Learning Path

### For Beginners:

1. Start with **Swagger UI** (http://localhost:5000/api-docs)
2. Try the `/health` endpoint
3. Try `GET /api/mca/stats`
4. Try `GET /api/mca` with different parameters
5. Graduate to creating/updating records

### For Developers:

1. Import **Postman collection**
2. Run "Complete Workflow Example"
3. Explore individual endpoints
4. Set up environments
5. Create your own test scenarios

---

## 🐛 Troubleshooting

### Swagger Not Loading

```bash
# Check server is running
curl http://localhost:5000/health

# Restart server
npm run dev

# Check console for errors
```

### Postman Connection Failed

1. Check `baseUrl` variable is correct
2. Ensure server is running
3. Try in browser first: http://localhost:5000/health
4. Check firewall settings

### Variables Not Saving (Postman)

1. Check collection is selected
2. Run requests that create data first
3. Check Variables tab in collection
4. Re-import collection if needed

### 404 Errors

- Verify endpoint path is correct
- Check server logs
- Ensure MongoDB is connected
- Try `/health` endpoint first

---

## 📚 Next Steps

After testing with these tools:

1. **Build Frontend** - Use the API in your React/Vue app
2. **Add Tests** - Write automated tests
3. **Deploy** - Deploy to production
4. **Monitor** - Add logging and monitoring
5. **Scale** - Optimize for production load

---

## 🎉 Summary

You now have **two powerful tools** to test your API:

- **🔷 Swagger UI**: http://localhost:5000/api-docs (Quick & Easy)
- **📦 Postman**: Import `MCA_Lending_API.postman_collection.json` (Professional)

Start with Swagger for quick tests, use Postman for serious work!

Happy Testing! 🚀

