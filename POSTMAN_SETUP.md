# Postman Setup Guide

Quick guide to get started with the Postman collection.

## Step 1: Install Postman

If you don't have Postman installed:

1. Go to https://www.postman.com/downloads/
2. Download for your OS (Mac/Windows/Linux)
3. Install and launch Postman
4. Create a free account (optional but recommended)

## Step 2: Import Collection

1. **Open Postman**

2. **Click "Import"** (top-left corner)

3. **Import the collection file:**
   - Option A: Drag and drop `MCA_Lending_API.postman_collection.json` into Postman
   - Option B: Click "Upload Files" and browse to select the file

4. **You should see "MCA Lending API" appear in your collections**

## Step 3: Start Your Server

```bash
cd backend-lending
npm run dev
```

Make sure you see:
```
✅ MongoDB Connected
🚀 Server is running on port 5000
```

## Step 4: Run Your First Request

1. **Open the collection** "MCA Lending API" in the left sidebar

2. **Click on** "Health & Info" → "Health Check"

3. **Click the blue "Send" button**

4. **You should see a response:**
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-11-24T..."
}
```

✅ **Success!** Your API is working!

## Step 5: Test Complete Workflow

The easiest way to test everything:

1. **Open** "Complete Workflow Example" folder

2. **Run each step in order:**
   - Step 1 - Create Test MCA ✅
   - Step 2 - Get MCA Details ✅
   - Step 3 - User Submits Response ✅
   - Step 4 - Verify Response Linked ✅
   - Step 5 - Approve Response ✅

3. **Check the Console** (View → Show Postman Console)
   - You'll see success messages after each step

## Understanding Collection Variables

The collection uses variables (like `{{baseUrl}}`, `{{uniqueId}}`) to make testing easier.

### View Variables

1. Click on "MCA Lending API" collection name
2. Click "Variables" tab
3. See current values:
   - `baseUrl`: http://localhost:5000
   - `uniqueId`: (auto-filled when you run requests)
   - `mcaId`: (auto-filled when you run requests)
   - `responseId`: (auto-filled when you run requests)

### How Auto-Save Works

When you run certain requests, they automatically save data:

- **"Create MCA Record"** → Saves `uniqueId` and `mcaId`
- **"Get MCA by ID"** → Saves `uniqueId` and `mcaId`
- **"Submit User Response"** → Saves `responseId`

This means you can run requests in sequence without copy-pasting IDs!

## Common Use Cases

### Use Case 1: Create and Test a Record

```
1. MCA Records → Create MCA Record
   → Auto-saves uniqueId

2. MCA Records → Get MCA by ID or UniqueId
   → Uses saved uniqueId automatically

3. User Responses → Submit User Response
   → Uses saved uniqueId automatically
```

### Use Case 2: Query and Filter Data

```
1. MCA Records → Get All MCA Records
   → Modify query params (page, limit, isActive)

2. MCA Records → Get MCA Statistics
   → See totals

3. User Responses → Get All Responses
   → Filter by status
```

### Use Case 3: Test Soft Delete

```
1. MCA Records → Get MCA by ID
   → Choose a record

2. MCA Records → Soft Delete MCA
   → Marks as inactive

3. MCA Records → Restore MCA
   → Reactivates it
```

## Tips & Tricks

### 💡 Tip 1: Use the Console
View → Show Postman Console to see detailed logs and auto-saved variables.

### 💡 Tip 2: Save Responses
Click "Save Response" to keep examples for later reference.

### 💡 Tip 3: Create Environments
Create different environments for dev/staging/production:
1. Click "Environments" in sidebar
2. Create new environment
3. Add `baseUrl` variable with different URLs
4. Switch environments easily

### 💡 Tip 4: Run Collections
Use Collections Runner to run all requests automatically:
1. Click "..." on collection
2. Select "Run collection"
3. Configure and run

### 💡 Tip 5: Edit Before Sending
Always click "Try it out" or modify the body before sending. All examples are templates!

## Troubleshooting

### Problem: "Could not send request"

**Solution:**
```bash
# Check if server is running
curl http://localhost:5000/health

# If not, start it:
npm run dev
```

### Problem: Variables not working

**Solution:**
1. Make sure you're using the correct collection
2. Run a "Create" or "Get" request first to populate variables
3. Check Variables tab to see current values

### Problem: "MCA record not found"

**Solution:**
1. Run "Get All MCA Records" first
2. Copy a real `uniqueId`
3. Update the collection variable manually

### Problem: MongoDB connection error

**Solution:**
1. Check `.env` file has correct MONGODB_URI
2. Ensure MongoDB is running
3. Check server console for connection errors

## What's Next?

After getting comfortable with Postman:

1. ✅ Test all endpoints
2. ✅ Create your own test scenarios
3. ✅ Set up multiple environments
4. ✅ Share collection with your team
5. ✅ Write automated tests
6. ✅ Integrate with CI/CD

## Quick Reference

### Most Useful Requests

| Endpoint | Use Case |
|----------|----------|
| `Health Check` | Test if server is running |
| `Get All MCA Records` | Browse data |
| `Get MCA by ID` | Get specific record |
| `Create MCA Record` | Add test data |
| `Submit User Response` | Test form submission |
| `Get MCA Statistics` | See totals |

### Collection Variables

| Variable | Description |
|----------|-------------|
| `{{baseUrl}}` | Server URL |
| `{{uniqueId}}` | Current MCA uniqueId |
| `{{mcaId}}` | Current MongoDB ID |
| `{{responseId}}` | Current response ID |

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Send Request | Cmd/Ctrl + Enter |
| New Request | Cmd/Ctrl + N |
| Search | Cmd/Ctrl + K |
| Console | Cmd/Ctrl + Alt + C |

## Need Help?

- **API Documentation**: http://localhost:5000/api-docs (Swagger)
- **Full Docs**: See README.md
- **Examples**: See API_EXAMPLES.md
- **Workflow**: See WORKFLOW.md

## Summary

1. ✅ Import `MCA_Lending_API.postman_collection.json`
2. ✅ Start server with `npm run dev`
3. ✅ Run "Health Check" to verify
4. ✅ Try "Complete Workflow Example"
5. ✅ Explore individual endpoints

You're ready to test! 🚀

