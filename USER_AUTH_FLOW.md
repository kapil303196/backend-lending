# 🔐 User Authentication & Application Flow

## Overview

Complete user authentication system integrated with the MCA application process. When users submit their application, a user account is automatically created, and they receive login credentials via email.

---

## 🔄 Complete Flow

### 1. **User Submits Application**

**Endpoint:** `POST /api/user-responses`

**What Happens:**
1. ✅ User fills out application form on frontend
2. ✅ Application data is saved to `UserResponse` collection
3. ✅ **User account is automatically created** in `User` collection
4. ✅ Secure 12-character password is generated
5. ✅ **Welcome email sent** with login credentials
6. ✅ User account is linked to their application

**Request Example:**
```json
POST /api/user-responses
{
  "uniqueId": "MCA-12345",
  "formData": {
    "email": "user@example.com",
    "businessName": "ABC Corp",
    "ownerName": "John Doe",
    "phone": "555-1234",
    "amountRequested": 50000,
    "monthlyRevenue": 100000
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Response submitted successfully",
  "data": {
    "userResponse": { /* application data */ },
    "userCreated": true,
    "userId": "user_id_here"
  }
}
```

**Email Sent:**
- **Subject:** 🎉 Welcome to Heroic Funding - Your Account Details
- **Contains:** Email, temporary password, application ID, login link

---

### 2. **User Logs In**

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "TempPass123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "lastLogin": "2025-12-15T..."
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Frontend Should:**
1. Store the JWT token (localStorage/sessionStorage)
2. Check `isFirstLogin` flag
3. If `isFirstLogin === true`, prompt user to change password
4. Redirect to dashboard/application view

---

### 3. **User Views Their Application**

**Endpoint:** `GET /api/auth/my-application`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "application": {
      "_id": "response_id",
      "uniqueId": "MCA-12345",
      "status": "pending",
      "formData": {
        "businessName": "ABC Corp",
        "amountRequested": 50000,
        "monthlyRevenue": 100000
      },
      "bankStatements": [...],
      "createdAt": "2025-12-15T...",
      "mcaId": {
        /* MCA details */
      }
    },
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "businessName": "ABC Corp",
      "phone": "555-1234",
      "isFirstLogin": true
    }
  }
}
```

---

## 📊 Database Schema

### User Model
```javascript
{
  email: String (unique, required),
  password: String (hashed, required),
  name: String,
  role: String (enum: ['admin', 'user', 'dealer'], default: 'user'),
  userResponseId: ObjectId (ref: 'UserResponse'),
  businessName: String,
  phone: String,
  isActive: Boolean (default: true),
  isFirstLogin: Boolean (default: true),
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### UserResponse Model
```javascript
{
  mcaId: ObjectId (ref: 'MCA'),
  uniqueId: String (required),
  formData: Mixed (application data),
  status: String (enum: ['pending', 'submitted', 'approved', 'rejected']),
  bankStatements: Array,
  ipAddress: String,
  userAgent: String,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🔐 Authentication Endpoints

### 1. Login
```
POST /api/auth/login
Body: { email, password }
Response: { user, token }
```

### 2. Verify Token
```
GET /api/auth/verify
Headers: Authorization: Bearer <token>
Response: { user }
```

### 3. Get My Application
```
GET /api/auth/my-application
Headers: Authorization: Bearer <token>
Response: { application, user }
```

### 4. Logout
```
POST /api/auth/logout
Headers: Authorization: Bearer <token>
Response: { success: true }
```

---

## 🎨 Frontend Integration Guide

### Step 1: Application Submission

```javascript
// When user submits application form
async function submitApplication(formData) {
  const response = await fetch('/api/user-responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uniqueId: 'MCA-12345',
      formData: {
        email: formData.email,
        businessName: formData.businessName,
        ownerName: formData.ownerName,
        phone: formData.phone,
        amountRequested: formData.amountRequested,
        monthlyRevenue: formData.monthlyRevenue
      }
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Show success message
    alert('Application submitted! Check your email for login credentials.');
  }
}
```

### Step 2: User Login

```javascript
// Login page
async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store token
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    
    // Redirect to dashboard
    window.location.href = '/dashboard';
  }
}
```

### Step 3: Fetch User's Application

```javascript
// Dashboard page
async function loadUserApplication() {
  const token = localStorage.getItem('token');
  
  const response = await fetch('/api/auth/my-application', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Display application data
    displayApplication(data.data.application);
    
    // Check if first login
    if (data.data.user.isFirstLogin) {
      showChangePasswordPrompt();
    }
  }
}

function displayApplication(application) {
  // Show application details
  document.getElementById('applicationId').textContent = application.uniqueId;
  document.getElementById('status').textContent = application.status;
  document.getElementById('amount').textContent = `$${application.formData.amountRequested.toLocaleString()}`;
  document.getElementById('submittedDate').textContent = new Date(application.createdAt).toLocaleDateString();
  
  // Show status badge with color
  const statusBadge = document.getElementById('statusBadge');
  statusBadge.textContent = application.status.toUpperCase();
  statusBadge.className = `badge badge-${application.status}`;
}
```

### Step 4: Protected Routes

```javascript
// Middleware to check authentication
function checkAuth() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    window.location.href = '/login';
    return false;
  }
  
  return true;
}

// Use on dashboard and other protected pages
if (!checkAuth()) {
  // User will be redirected to login
}
```

---

## 🔒 Security Features

### Password Security
- ✅ Passwords are hashed using bcrypt (10 salt rounds)
- ✅ Temporary passwords are 12 characters with mixed case, numbers, and symbols
- ✅ Passwords never returned in API responses
- ✅ `isFirstLogin` flag prompts password change

### JWT Tokens
- ✅ Tokens expire in 7 days (configurable via `JWT_EXPIRES_IN`)
- ✅ Tokens include user ID, email, and role
- ✅ All protected routes require valid token
- ✅ Tokens verified using JWT secret

### Email Validation
- ✅ Email required for account creation
- ✅ Emails converted to lowercase
- ✅ Duplicate emails handled gracefully

---

## 📧 Email Integration

### Welcome Email
**Sent when:** New user account is created  
**Contains:**
- User's name
- Login email
- Temporary password
- Application ID
- Login link
- Security notice

**Template:** Beautiful HTML email with branding

---

## 🎯 User Roles

### User (Applicant)
- ✅ Can log in with email/password
- ✅ Can view their own application
- ✅ Can track application status
- ✅ Default role for new applicants

### Admin
- ✅ Full access to all applications
- ✅ Can update application status
- ✅ Can manage users
- ✅ Access to admin dashboard

### Dealer
- ✅ Can view assigned applications
- ✅ Can make offers
- ✅ Limited admin access

---

## 🧪 Testing

### Test User Account Creation

```bash
# Submit application
POST http://localhost:3000/api/user-responses
{
  "uniqueId": "MCA-TEST-001",
  "formData": {
    "email": "test@example.com",
    "businessName": "Test Business",
    "ownerName": "Test User",
    "phone": "555-1234",
    "amountRequested": 50000
  }
}

# Check email for credentials
# Email will contain temporary password

# Login with credentials
POST http://localhost:3000/api/auth/login
{
  "email": "test@example.com",
  "password": "<password_from_email>"
}

# Get application
GET http://localhost:3000/api/auth/my-application
Headers: Authorization: Bearer <token_from_login>
```

---

## 📝 Environment Variables

Add to `.env`:
```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Email Configuration (already set up)
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM_NAME=Heroic Funding
FRONTEND_URL=http://localhost:5173
SUPPORT_EMAIL=support@logicspark.com
```

---

## 🚀 Next Steps for Frontend

### 1. Create Login Page
- Email and password inputs
- Login button
- "Forgot password" link (optional)
- Error handling

### 2. Create Dashboard Page
- Display application status
- Show application details
- Status badge (color-coded)
- Application timeline
- Document upload section

### 3. Implement Auth Context
```javascript
// AuthContext.js
const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  const login = async (email, password) => {
    // Login logic
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 4. Add Protected Route Component
```javascript
function ProtectedRoute({ children }) {
  const { token } = useAuth();
  
  if (!token) {
    return <Navigate to="/login" />;
  }
  
  return children;
}
```

---

## ✅ Summary

**What's Working:**
1. ✅ User account automatically created on application submission
2. ✅ Secure password generation (12 characters)
3. ✅ Welcome email sent with credentials
4. ✅ User can log in with email/password
5. ✅ JWT token authentication
6. ✅ User can fetch their application data
7. ✅ Application linked to user account
8. ✅ Role-based access control ready

**Frontend Needs to Implement:**
1. Login page
2. Dashboard to display application
3. Auth context/state management
4. Protected routes
5. Password change functionality (optional)

---

**Ready to integrate with frontend!** 🎉

All backend endpoints are working and tested. Frontend just needs to call these APIs and display the data.
