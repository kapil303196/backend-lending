# API Usage Examples

This document provides practical examples of using the MCA Lending API.

## Setup

All examples assume the API is running at `http://localhost:5000`.

## cURL Examples

### 1. Health Check

```bash
curl http://localhost:5000/health
```

### 2. Get All MCA Records (First Page)

```bash
curl http://localhost:5000/api/mca?page=1&limit=10
```

### 3. Get Only Active MCA Records

```bash
curl http://localhost:5000/api/mca?isActive=true
```

### 4. Get MCA by UniqueId

```bash
curl http://localhost:5000/api/mca/ABC12345
```

### 5. Create a New MCA Record

```bash
curl -X POST http://localhost:5000/api/mca \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Example Corp",
    "contactPerson": "John Doe",
    "amount": "50000",
    "status": "pending"
  }'
```

### 6. Update an MCA Record

```bash
curl -X PUT http://localhost:5000/api/mca/ABC12345 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "notes": "Approved after review"
  }'
```

### 7. Soft Delete an MCA Record

```bash
curl -X DELETE http://localhost:5000/api/mca/ABC12345
```

### 8. Restore a Soft Deleted Record

```bash
curl -X POST http://localhost:5000/api/mca/ABC12345/restore
```

### 9. Submit User Response (Form Submission)

```bash
curl -X POST http://localhost:5000/api/responses \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueId": "ABC12345",
    "isVerified": true,
    "comments": "All information looks correct",
    "formData": {
      "signature": "John Doe",
      "signatureDate": "2024-11-24",
      "acknowledgedTerms": true
    },
    "verifiedFields": [
      {
        "fieldName": "businessName",
        "isCorrect": true,
        "note": "Correct"
      },
      {
        "fieldName": "amount",
        "isCorrect": false,
        "correctedValue": "55000",
        "note": "Amount should be 55000"
      }
    ],
    "userContact": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "555-1234"
    },
    "status": "submitted"
  }'
```

### 10. Get All Responses for an MCA

```bash
curl http://localhost:5000/api/responses/mca/ABC12345
```

### 11. Get Response Statistics

```bash
curl http://localhost:5000/api/responses/stats
```

### 12. Get MCA Statistics

```bash
curl http://localhost:5000/api/mca/stats
```

## JavaScript/Fetch Examples

### Get MCA by UniqueId

```javascript
async function getMCAData(uniqueId) {
  try {
    const response = await fetch(`http://localhost:5000/api/mca/${uniqueId}`);
    const data = await response.json();
    
    if (data.success) {
      console.log('MCA Data:', data.data);
      return data.data;
    } else {
      console.error('Error:', data.message);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

// Usage
getMCAData('ABC12345');
```

### Submit User Response

```javascript
async function submitUserResponse(formData) {
  try {
    const response = await fetch('http://localhost:5000/api/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Response submitted successfully!');
      return data.data;
    } else {
      console.error('Submission error:', data.message);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

// Usage
submitUserResponse({
  uniqueId: 'ABC12345',
  isVerified: true,
  comments: 'All correct',
  formData: {
    signature: 'John Doe',
    date: new Date().toISOString()
  },
  userContact: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  status: 'submitted'
});
```

### Get All MCA Records with Pagination

```javascript
async function getAllMCA(page = 1, limit = 50) {
  try {
    const response = await fetch(
      `http://localhost:5000/api/mca?page=${page}&limit=${limit}&isActive=true`
    );
    const data = await response.json();
    
    if (data.success) {
      console.log('Records:', data.data);
      console.log('Pagination:', data.pagination);
      return data;
    }
  } catch (error) {
    console.error('Error:', error);
  }
}
```

## React Example - User Verification Form

```javascript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

function VerificationForm() {
  const { uniqueId } = useParams();
  const [mcaData, setMcaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    comments: '',
    userContact: {
      name: '',
      email: '',
      phone: ''
    }
  });

  useEffect(() => {
    // Fetch MCA data
    fetch(`http://localhost:5000/api/mca/${uniqueId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMcaData(data.data);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error:', error);
        setLoading(false);
      });
  }, [uniqueId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const response = await fetch('http://localhost:5000/api/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uniqueId: uniqueId,
        isVerified: true,
        ...formData,
        status: 'submitted'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Response submitted successfully!');
    } else {
      alert('Error: ' + result.message);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!mcaData) return <div>Record not found</div>;

  return (
    <div>
      <h1>Verify Your Information</h1>
      
      {/* Display MCA data */}
      <div>
        <h2>Your Information</h2>
        <pre>{JSON.stringify(mcaData, null, 2)}</pre>
      </div>

      {/* Verification form */}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Your Name"
          value={formData.userContact.name}
          onChange={(e) => setFormData({
            ...formData,
            userContact: { ...formData.userContact, name: e.target.value }
          })}
          required
        />
        
        <input
          type="email"
          placeholder="Your Email"
          value={formData.userContact.email}
          onChange={(e) => setFormData({
            ...formData,
            userContact: { ...formData.userContact, email: e.target.value }
          })}
          required
        />
        
        <textarea
          placeholder="Comments"
          value={formData.comments}
          onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
        />
        
        <button type="submit">Submit Verification</button>
      </form>
    </div>
  );
}

export default VerificationForm;
```

## Python Example

```python
import requests
import json

BASE_URL = "http://localhost:5000"

# Get MCA by uniqueId
def get_mca(unique_id):
    response = requests.get(f"{BASE_URL}/api/mca/{unique_id}")
    return response.json()

# Create user response
def submit_response(unique_id, user_data):
    payload = {
        "uniqueId": unique_id,
        "isVerified": True,
        "comments": user_data.get("comments", ""),
        "userContact": user_data.get("contact", {}),
        "status": "submitted"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/responses",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    return response.json()

# Usage
if __name__ == "__main__":
    # Get MCA data
    mca = get_mca("ABC12345")
    print("MCA Data:", json.dumps(mca, indent=2))
    
    # Submit response
    user_data = {
        "comments": "Everything looks good",
        "contact": {
            "name": "John Doe",
            "email": "john@example.com",
            "phone": "555-1234"
        }
    }
    
    result = submit_response("ABC12345", user_data)
    print("Submission Result:", json.dumps(result, indent=2))
```

## Postman Collection

You can import these endpoints into Postman:

1. Create a new collection called "MCA Lending API"
2. Set a collection variable: `baseUrl` = `http://localhost:5000`
3. Add the following requests:

- GET `{{baseUrl}}/api/mca` - Get all MCA
- GET `{{baseUrl}}/api/mca/:id` - Get MCA by ID
- POST `{{baseUrl}}/api/mca` - Create MCA
- PUT `{{baseUrl}}/api/mca/:id` - Update MCA
- DELETE `{{baseUrl}}/api/mca/:id` - Soft delete
- POST `{{baseUrl}}/api/responses` - Submit response
- GET `{{baseUrl}}/api/responses/mca/:id` - Get responses

## Error Handling Examples

```javascript
async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Operation failed');
    }
    
    return data.data;
  } catch (error) {
    console.error('API Error:', error.message);
    throw error;
  }
}

// Usage with error handling
try {
  const mca = await safeFetch('http://localhost:5000/api/mca/ABC12345');
  console.log('Success:', mca);
} catch (error) {
  console.error('Failed to fetch MCA:', error.message);
}
```

## Rate Limiting Considerations

If you implement rate limiting, handle it like this:

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('Retry-After') || 1;
        console.log(`Rate limited, retrying after ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      
      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

