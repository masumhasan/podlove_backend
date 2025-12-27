# Quick Setup Guide - Bidirectional AI Vector Matching

## Overview

This guide walks you through setting up **bidirectional AI-powered matching** using OpenAI embeddings and Pinecone vector database.

### What You'll Get
- ✅ Dual vector storage (profile + preferences per user)
- ✅ Bidirectional matching (mutual compatibility)
- ✅ All profiles stored and synced automatically
- ✅ Strict distance filtering
- ✅ Complete profiles only in results
- ✅ Fast, high-quality embeddings (OpenAI)

---

## Step-by-Step Setup

### 1. Create Pinecone Index

Go to [Pinecone Console](https://app.pinecone.io/) and create a new index:

```
Name: users
Dimensions: 1024 (⚠️ IMPORTANT!)
Metric: cosine
Cloud: AWS
Region: us-east-1 (or closest to you)
```

**Wait for index status to show "Ready"** (~2 minutes)

### 2. Verify Environment Variables

Check your `.env` file has:

```env
OPENAI_KEY=sk-proj-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=users
```

✅ All environment variables are already configured!

### 3. Test Vector Setup

Before migrating data, verify everything works:

```powershell
pnpm vector:test
```

Expected output:
```
🧪 Testing Vector Matching Setup

1️⃣  Checking environment variables...
   ✅ All environment variables present

2️⃣  Checking Pinecone connection...
   ✅ Pinecone index "users" is ready

3️⃣  Testing OpenAI embedding generation...
   ✅ Embedding generated successfully (1024 dimensions)

4️⃣  Testing user profile conversion...
   ✅ Profile text generated (520 chars)
   ✅ Preference text generated (85 chars)

✅ All tests passed! Vector matching setup is ready.
```

### 4. Migrate Existing Users

Run the migration script to index existing users:

```powershell
pnpm vector:migrate
```

This will:
- Connect to your MongoDB
- Find ALL users (complete and incomplete profiles)
- Generate TWO embeddings per user (profile + preferences)
- Upsert to Pinecone in batches

Expected output:
```
🚀 Starting user migration to Pinecone...
📦 Connecting to MongoDB...
✅ Connected to MongoDB
🔍 Checking Pinecone health...
✅ Pinecone index "users" is ready
📊 Fetching ALL users (complete and incomplete profiles)...
Found 52 users total
🔄 Upserting users to Pinecone...
⏳ Processed 10/52, waiting 2s to avoid rate limits...
✅ Upserted batch 1 (20 vectors: 10 profiles + 10 preferences)
⏳ Processed 20/52, waiting 2s to avoid rate limits...
✅ Upserted batch 2 (20 vectors: 10 profiles + 10 preferences)
...
✅ Migration completed successfully!
Total vectors: 104 (52 users × 2 vectors each)
```

**Time**: ~2-10 minutes depending on user count (OpenAI has higher rate limits)

---

## Verification

### 1. Check Pinecone Console

Go to [Pinecone Console](https://app.pinecone.io/):
- **Vector count** should be `2 × number of users`
- **Vector IDs** should end with `_profile` or `_pref`
- **Metadata** should include `vectorType` field

### 2. Test Matching

```powershell
pnpm test:matching <userId>
```

Expected output:
```
🧪 Testing Vector Matching for User: <userId>

📊 User Profile:
   Name: John Doe
   Gender: male
   Looking for: female
   Distance preference: 25 km

🔍 Querying Pinecone index: users for bidirectional similarity
✅ Found 8 bidirectional matches (my prefs vs their profile AND their prefs vs my profile)
📍 5 matches within 25km distance preference

Top 5 Matches:
1. Jane Smith - Score: 82.5% - Distance: 12.3 km
2. Sarah Johnson - Score: 78.2% - Distance: 18.7 km
...
```

### 3. Monitor Server Logs

Watch for automatic sync messages:

**Profile Updates:**
```
✅ User 690b266957468589cd23226d synced to Pinecone (profile + preferences)
```

**Matching Requests:**
```
🔍 Querying Pinecone index: users for bidirectional similarity
✅ Found 8 bidirectional matches
📍 5 matches within 25km distance preference
✅ Returning 5 matches (all within 25km)
```

---

## What Happens Now?

### Automatic Behavior

✅ **User registration** → Auto-sync to Pinecone (2 vectors: profile + preferences)
✅ **User profile updates** → Auto-sync to Pinecone (both vectors updated)
✅ **Bio updates** → Auto-sync to Pinecone (both vectors updated)
✅ **Match requests** → Use bidirectional Pinecone similarity search
✅ **Distance filtering** → Strict enforcement after AI scoring
✅ **Complete profiles only** → MongoDB filter ensures quality results
✅ **Fallback** → If Pinecone fails, use OpenAI compatibility API

### No Changes Required

- All existing API endpoints work as before
- No code changes needed for frontend
- MongoDB remains the primary database
- Pinecone is transparent to the application
- All profiles stored (incomplete profiles excluded from matching)

---

## Monitoring

Watch your server logs for:

### Success Messages
```
✅ User 690b266957468589cd23226d synced to Pinecone (profile + preferences)
✅ Using vector similarity scores for 8 candidates
✅ Pinecone index "podlove-users" is ready
```

### Warning Messages
```
⚠️ Vector search failed, falling back to OpenAI compatibility
⚠️ Failed to sync user <userId> to Pinecone: <reason>
```

If you see warnings, check:
1. Pinecone index exists and is ready
2. `PINECONE_API_KEY` is valid
3. `PINECONE_INDEX` matches your index name

## Common Issues

### Issue: "PINECONE_INDEX is not set"

**Fix**: Add to `.env`:
```env
PINECONE_INDEX=podlove-users
```

### Issue: "Index does not exist"

**Fix**: Create the index in Pinecone console with:
- Dimensions: 1024
- Metric: cosine

### Issue: Migration script fails

**Fix**: Ensure MongoDB connection works:
```powershell
# Test MongoDB connection
npx ts-node -e "import mongoose from 'mongoose'; mongoose.connect(process.env.ATLAS_URI).then(() => console.log('✅ Connected')).catch(err => console.error('❌', err))"
```

## Next Steps

1. Run migration script (if not done already)
2. Monitor logs for first few matches
3. Compare match quality (vector vs. OpenAI fallback)
4. Optionally: Set up monitoring/alerts for Pinecone

## Need Help?

Check the comprehensive guide:
- [VECTOR_MATCHING_README.md](./VECTOR_MATCHING_README.md)

---

**Status**: Ready to deploy ✅  
**Setup Time**: ~5 minutes  
**Migration Time**: ~1-2 minutes per 100 users
