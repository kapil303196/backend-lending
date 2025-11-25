# 🚀 Test Your API NOW!

Choose your weapon and start testing in 30 seconds!

## 🔷 Option 1: Swagger UI (Easiest!)

**3 Steps:**

1. **Start server:**
   ```bash
   npm run dev
   ```

2. **Open in browser:**
   ```
   http://localhost:5000/api-docs
   ```

3. **Try it out:**
   - Click any endpoint
   - Click "Try it out"
   - Click "Execute"
   - See results! 🎉

**No installation. No setup. Just works!** ✨

---

## 📦 Option 2: Postman (More Powerful)

**4 Steps:**

1. **Start server:**
   ```bash
   npm run dev
   ```

2. **Import in Postman:**
   - Open Postman
   - Click "Import"
   - Drag `MCA_Lending_API.postman_collection.json`

3. **Test health check:**
   - Click "Health Check"
   - Click "Send"

4. **Run complete workflow:**
   - Open "Complete Workflow Example"
   - Run Step 1, 2, 3, 4, 5 in order
   - Done! 🎉

---

## 🎯 Quick Test Checklist

### Basic Tests (Do This First!)

- [ ] Health check: `GET /health`
- [ ] Get MCA stats: `GET /api/mca/stats`
- [ ] Get all MCA: `GET /api/mca?limit=5`
- [ ] Get response stats: `GET /api/responses/stats`

### Create & Read Tests

- [ ] Create MCA record: `POST /api/mca`
- [ ] Get by uniqueId: `GET /api/mca/{uniqueId}`
- [ ] Submit response: `POST /api/responses`
- [ ] Get responses for MCA: `GET /api/responses/mca/{uniqueId}`

### Update Tests

- [ ] Update MCA: `PUT /api/mca/{uniqueId}`
- [ ] Update response status: `PATCH /api/responses/{id}/status`

### Delete Tests

- [ ] Soft delete: `DELETE /api/mca/{uniqueId}`
- [ ] Restore: `POST /api/mca/{uniqueId}/restore`

---

## 🎬 Complete Workflow (Copy & Paste!)

### Using cURL:

```bash
# 1. Health check
curl http://localhost:5000/health

# 2. Create MCA
curl -X POST http://localhost:5000/api/mca \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Company",
    "contactPerson": "John Doe",
    "amount": "50000"
  }'

# Copy the uniqueId from response, then:

# 3. Get MCA by uniqueId (replace YOUR_ID)
curl http://localhost:5000/api/mca/YOUR_ID

# 4. Submit response (replace YOUR_ID)
curl -X POST http://localhost:5000/api/responses \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueId": "YOUR_ID",
    "isVerified": true,
    "comments": "All correct!",
    "userContact": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "status": "submitted"
  }'

# 5. Verify link (replace YOUR_ID)
curl http://localhost:5000/api/mca/YOUR_ID
```

### Using JavaScript (Browser Console):

```javascript
// Open browser to http://localhost:5000
// Open console (F12) and paste:

async function testAPI() {
  const baseUrl = 'http://localhost:5000';
  
  // 1. Create MCA
  const mca = await fetch(`${baseUrl}/api/mca`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: 'Test Company',
      contactPerson: 'Jane Smith',
      amount: '75000'
    })
  }).then(r => r.json());
  
  console.log('✅ MCA Created:', mca.data.uniqueId);
  
  // 2. Submit response
  const response = await fetch(`${baseUrl}/api/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uniqueId: mca.data.uniqueId,
      isVerified: true,
      comments: 'Looks good!',
      userContact: {
        name: 'Jane Smith',
        email: 'jane@example.com'
      },
      status: 'submitted'
    })
  }).then(r => r.json());
  
  console.log('✅ Response Submitted:', response.data._id);
  
  // 3. Verify
  const verified = await fetch(`${baseUrl}/api/mca/${mca.data.uniqueId}`)
    .then(r => r.json());
  
  console.log('✅ Linked!', verified.data.userResponses);
  console.log('🎉 Complete!');
}

testAPI();
```

---

## 📊 What Should You See?

### ✅ Successful Response:
```json
{
  "success": true,
  "data": { ... },
  "message": "..."
}
```

### ❌ Error Response:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Details"
}
```

---

## 🐛 Troubleshooting (30 Second Fixes)

### Server not responding?
```bash
# Check if running
curl http://localhost:5000/health

# If not, start it
npm run dev

# Still not working? Check MongoDB
# Make sure .env has MONGODB_URI
```

### 404 Not Found?
- Check URL spelling
- Ensure server is running on port 5000
- Try http://localhost:5000/health first

### MongoDB Connection Error?
```bash
# Check .env file exists
cat .env

# Should have:
# MONGODB_URI=mongodb+srv://...
# MONGO_DB=efilebusiness
```

### Can't find uniqueId?
```bash
# Get all records
curl http://localhost:5000/api/mca?limit=1

# Or create one
curl -X POST http://localhost:5000/api/mca \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Test"}'
```

---

## 🎯 Success Criteria

You know it's working when:

✅ Server starts without errors  
✅ `/health` returns 200 OK  
✅ `/api/mca` returns data (even if empty array)  
✅ You can create a record with POST  
✅ You can get that record back  
✅ You can submit a response  
✅ Response appears in MCA's userResponses array  

---

## 📚 More Help

| Guide | What's It For |
|-------|---------------|
| `TESTING_GUIDE.md` | Complete testing guide (Swagger + Postman) |
| `POSTMAN_SETUP.md` | Detailed Postman setup |
| `QUICKSTART.md` | Get started in 5 minutes |
| `API_EXAMPLES.md` | Code examples (JS, Python, React) |
| `WORKFLOW.md` | Understand the complete flow |

---

## 🎉 You're Ready!

Pick your tool and start testing:

- 🔷 **Swagger**: http://localhost:5000/api-docs
- 📦 **Postman**: Import the collection file

**Need help?** Check `TESTING_GUIDE.md` for detailed instructions!

---

**Happy Testing!** 🚀

_Remember: Start the server first with `npm run dev`_

