# Testing Guide - Bidirectional AI Matching

## 🧪 Available Test Commands

### 1. Check Database Users
```bash
pnpm checkusers
```

**What it does:**
- Shows total users count
- Shows complete profiles count
- Shows users with location data
- Lists sample users with their details

**Example output:**
```
📊 Database Stats:
   Total users: 52
   Complete profiles: 37
   Users with location: 52

Sample users:
   - Andrew Williams (Male) - Complete: true, Location: Philadelphia, PA
   - Emily Young (Female) - Complete: true, Location: Phoenix, AZ
   ...
```

---

### 2. Test Vector Setup
```bash
pnpm vector:test
```

**What it does:**
- Checks environment variables
- Tests Pinecone connection
- Tests OpenAI embedding generation
- Validates configuration

**Example output:**
```
🧪 Testing Vector Matching Setup

1️⃣  Checking environment variables...
   ✅ All environment variables present

2️⃣  Checking Pinecone connection...
   ✅ Pinecone index "podlove-users" is ready

3️⃣  Testing OpenAI embedding generation...
   ✅ Embedding generated successfully (1024 dimensions)

✅ All tests passed!
```

---

### 3. Test Bidirectional Matching
```bash
# Auto-select first complete profile
pnpm test:matching

# Or specify a user ID
pnpm test:matching 69491ae76deb0a8a65221dc2
```

**What it does:**
- Connects to MongoDB
- Loads test user profile
- Applies MongoDB filters (gender, age, body type, ethnicity)
- Filters by distance preference
- Uses bidirectional AI vector matching
- Shows top 5 most compatible matches with scores

**Example output:**
```
🎯 Testing AI-Powered Matching System

👤 Test User Profile:
   Name: Andrew Williams
   Gender: Male
   Age: 16/4/1983
   Location: Philadelphia, PA

🎯 Preferences:
   Looking for: Female
   Age range: 32 - 52
   Distance: within 50 km

🤖 Running AI similarity matching...
🔍 Querying Pinecone index: podlove-users for bidirectional similarity
✅ Found 14 bidirectional matches

🏆 TOP 5 MATCHING USERS

1. Emily Young
   🎯 Match Score: 67.9%
   📏 Distance: 2077.0 km
   📝 Bio: Passionate about fitness and healthy living...
```

---

### 4. Migrate Users to Pinecone
```bash
pnpm vector:migrate
```

**What it does:**
- Connects to MongoDB
- Fetches ALL users (complete and incomplete)
- Generates 2 embeddings per user (profile + preference)
- Uploads to Pinecone in batches
- Handles rate limiting automatically

**Run this once** after setting up Pinecone index.

---

## 📊 Understanding Match Scores

### Bidirectional Scoring
Each match gets TWO scores:

1. **Query 1**: My preferences → Their profile
   - "What I want" vs "Who they are"
   
2. **Query 2**: Their preferences → My profile
   - "What they want" vs "Who I am"

**Final Score** = Average of both (only if both > 0)

This ensures **mutual compatibility** - both users must be interested in each other!

---

## 🔍 What the Test Shows

### User Profile
- Name, gender, age, location
- Bio and interests
- Personality traits

### User Preferences
- Preferred gender(s)
- Age range
- Body type preferences
- Ethnicity preferences
- Distance preference

### Match Results
For each match:
- **Match Score** (0-100%) - Bidirectional compatibility
- **Distance** - Actual distance in km
- **Profile Details** - Demographics, bio, interests
- **Compatibility Answers** - Number of questions answered

---

## 🐛 Troubleshooting

### No matches found
**Possible causes:**
1. No users within distance preference
2. No complete profiles in database
3. Preferences too restrictive

**Solution:** Increase distance or check database with `pnpm checkusers`

### Vector search failed
**Error:** `Vector dimension mismatch`

**Solution:** Pinecone index must have **1024 dimensions**. Delete and recreate if needed.

### Rate limit errors
**Error:** `429 Too Many Requests`

**Solution:** Wait a few seconds and try again. Free tier has rate limits.

---

## 📝 Notes

- **Distance Filter**: Applied AFTER AI scoring for strict enforcement
- **Complete Profiles Only**: Only users with `isProfileComplete: true` appear in results
- **Non-Blocking Sync**: Profile updates sync to Pinecone in background
- **Graceful Fallback**: If Pinecone fails, system falls back to OpenAI compatibility scoring

---

## 🎯 Example Test Workflow

1. **Check database**
   ```bash
   pnpm checkusers
   ```

2. **Verify setup**
   ```bash
   pnpm vector:test
   ```

3. **Migrate users** (if not done already)
   ```bash
   pnpm vector:migrate
   ```

4. **Test matching** with a specific user
   ```bash
   pnpm test:matching 69491ae76deb0a8a65221dc2
   ```

5. **Start server** and use real API
   ```bash
   pnpm run dev
   ```

---

**Last Updated**: December 24, 2025  
**Status**: ✅ All tests passing
