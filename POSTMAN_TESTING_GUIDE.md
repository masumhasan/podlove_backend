# Testing findMatch API with Postman - Step by Step Guide

## 📋 Prerequisites

Before testing, ensure:
1. ✅ Server is running (`pnpm run dev`)
2. ✅ MongoDB is connected
3. ✅ Pinecone index is set up
4. ✅ You have at least one user account in the database
5. ✅ You have a valid JWT token

---

## 🔐 Step 1: Get Authentication Token

### Option A: Login to Get Token

**Request:**
```
POST http://localhost:8000/api/auth/login
Content-Type: application/json

Body:
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

**Copy the `token` value** - you'll need it for the next step!

---

## 🎯 Step 2: Test findMatch Endpoint

### Request Setup in Postman

**1. Create New Request:**
- Click "New" → "HTTP Request"
- Name it: "Find AI Matches"

**2. Configure Request:**

**Method:** `GET`

**URL:** 
```
http://localhost:8000/api/user/match/findMatch
```

**3. Add Authorization Header:**

Click "Headers" tab and add:
```
Key: Authorization
Value: Bearer YOUR_TOKEN_HERE
```

Replace `YOUR_TOKEN_HERE` with the token from Step 1.

**Example:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRoSWQiOiI2NzRiZGQ0...
```

**4. Send Request:**
- Click the blue "Send" button
- Wait for response (may take 2-5 seconds)

---

## ✅ Step 3: Understanding the Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "User successfully updated matches for the podcast",
  "data": {
    "_id": "67...",
    "primaryUser": "67...",
    "participants": [
      {
        "user": "674bdd49...",  // Your user ID
        "score": 100,
        "isQuestionAnswer": ""
      },
      {
        "user": "674bdd50...",  // Match 1
        "score": 67.9,
        "isQuestionAnswer": ""
      },
      {
        "user": "674bdd51...",  // Match 2
        "score": 65.2,
        "isQuestionAnswer": ""
      }
    ],
    "status": "NotScheduled",
    "createdAt": "2025-12-24T10:30:00.000Z",
    "updatedAt": "2025-12-24T10:30:00.000Z"
  }
}
```

### What This Means:
- **participants[0]**: You (primary user) - always score 100
- **participants[1-N]**: Your AI-matched users with compatibility scores
- **Score**: 0-100% compatibility (higher = better match)
- **Number of matches**: Based on your subscription plan:
  - LISTENER: 2 matches
  - SPEAKER: 4 matches
  - Default: 3 matches

---

## 🔍 Step 4: Check Server Logs

While the request is processing, watch your server logs for:

```
✅ Using vector similarity scores for 14 candidates
📍 5 matches within 50km distance preference
✅ Returning 2 matches (all within 50km)
```

This shows:
1. ✅ AI vector matching is working
2. 📍 Distance filtering applied
3. ✅ Top matches returned

---

## ⚠️ Common Responses & What They Mean

### No Matches Found

```json
{
  "success": false,
  "message": "No suitable matches found at this time",
  "data": {}
}
```

**Reasons:**
- No users match your preferences (gender, age, body type, ethnicity)
- No users within your distance preference
- No users with complete profiles
- All matching users already matched (isMatch: true)

**Fix:** Check your preferences or run `pnpm checkusers` to see available users.

---

### Unauthorized (401)

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**Reason:** Missing or invalid token

**Fix:** 
1. Ensure Authorization header is set
2. Token format: `Bearer <token>`
3. Get a fresh token by logging in again

---

### User Not Found (404)

```json
{
  "success": false,
  "message": "User not found"
}
```

**Reason:** The userId from your token doesn't exist in database

**Fix:** Register a new account or use correct credentials

---

### Server Error (500)

**Reason:** Could be:
- MongoDB connection issue
- Pinecone connection issue
- Missing user preferences

**Fix:** Check server logs for detailed error message

---

## 🧪 Step 5: Verify Matches Work

### Check if Pinecone is Used

**In server logs, you should see:**
```
✅ Using vector similarity scores for X candidates
```

**If you see this instead:**
```
⚠️ Vector search failed, falling back to OpenAI compatibility
✅ Using OpenAI compatibility scores for X candidates
```

**Action:** Check:
1. Pinecone index exists: `pnpm vector:test`
2. Users are migrated: `pnpm vector:migrate`
3. PINECONE_API_KEY and PINECONE_INDEX in .env

---

## 📊 Step 6: Test Different Scenarios

### Scenario 1: First Time Matching
```
GET /api/user/match/findMatch
```
- Creates new podcast with matches
- Sets isMatch: true for all participants

### Scenario 2: Refresh Matches
```
GET /api/user/match/findMatch
```
- Updates existing podcast with new matches
- Previous matches are replaced

### Scenario 3: After Profile Update
1. Update your profile preferences
2. Call findMatch again
3. Should get different matches based on new preferences

---

## 🎯 Step 7: Validate Match Quality

### Check Match Scores

**Good matches:** 60-100%
**Average matches:** 40-60%
**Poor matches:** 0-40%

### Verify Bidirectional Matching

Each match should satisfy:
1. ✅ Your preferences → Their profile
2. ✅ Their preferences → Your profile

### Check Distance Compliance

All matches should be within your distance preference:
- If you set 50km, all matches ≤ 50km

---

## 🔧 Debugging Tips

### Enable Detailed Logs

Watch server console for:
```
No candidates found matching criteria
✅ Using vector similarity scores for 14 candidates
📍 Filtering out user X: 2077.0km exceeds 50km preference
📍 5 matches within 50km distance preference
✅ Returning 2 matches (all within 50km)
```

### Test Vector System Separately

```bash
# Test setup
pnpm vector:test

# Test matching for specific user
pnpm test:matching YOUR_USER_ID
```

### Check Database State

```bash
# See available users
pnpm checkusers
```

---

## 📝 Complete Postman Collection

Save this as a collection for easy testing:

**1. Login**
```
POST http://localhost:8000/api/auth/login
Headers: Content-Type: application/json
Body: {"email":"test@example.com","password":"password123"}
```

**2. Find Matches**
```
GET http://localhost:8000/api/user/match/findMatch
Headers: Authorization: Bearer {{token}}
```

**3. Get Matched Users**
```
GET http://localhost:8000/api/user/match
Headers: Authorization: Bearer {{token}}
```

**4. Update Profile**
```
PUT http://localhost:8000/api/user
Headers: 
  Authorization: Bearer {{token}}
  Content-Type: application/json
Body: {
  "preferences": {
    "gender": ["Female"],
    "age": {"min": 25, "max": 35},
    "distance": 50
  }
}
```

---

## ✨ Expected Workflow

1. **Login** → Get token
2. **Update preferences** (optional)
3. **Call findMatch** → Get AI-powered matches
4. **Check response** → See matched users with scores
5. **Verify logs** → Confirm AI matching worked
6. **Test again** → Should update existing matches

---

## 🎉 Success Criteria

✅ **Request successful** (200 OK)
✅ **Participants array has matches** (your user + matched users)
✅ **Match scores present** (0-100 range)
✅ **Server logs show vector matching** 
✅ **Distance filter applied**
✅ **Only complete profiles returned**

---

**Need Help?**
- Check server logs for detailed error messages
- Run `pnpm vector:test` to verify setup
- Run `pnpm checkusers` to see available users
- Ensure your profile is complete with preferences set

**Last Updated:** December 24, 2025
