# Migration Instructions - Bidirectional Matching Update

## ⚠️ Important Changes

The matching system has been upgraded to use **dual vectors per user** (profile + preferences). Existing Pinecone data uses the old single-vector format and needs to be migrated.

---

## 🔄 Migration Steps

### Step 1: Backup Current Data (Optional)

If you want to preserve current Pinecone state:
```bash
# Export current vectors (optional - Pinecone doesn't have built-in export)
# You can skip this if you're okay with re-indexing from MongoDB
```

### Step 2: Clear Old Vectors

**Option A: Delete Index and Recreate** (Fastest)
1. Go to Pinecone Console: https://app.pinecone.io/
2. Delete the `users` index
3. Create a new index with same settings:
   - Name: `users`
   - Dimensions: `1024`
   - Metric: `cosine`
   - Region: `us-east-1` (or your preferred region)

**Option B: Keep Index, Delete All Vectors** (Safer)
```bash
# This will be done automatically by the migration script
# No manual action needed
```

### Step 3: Run Migration Script

```bash
pnpm vector:migrate
```

**What this does**:
- Fetches ALL users from MongoDB (not just complete profiles)
- Generates TWO embeddings per user:
  - `userId_profile` - User's profile (who they ARE)
  - `userId_pref` - User's preferences (what they WANT)
- Uploads to Pinecone in batches (10 users per batch with rate limiting)

**Expected Output**:
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
Total vectors created: 104 (52 users × 2 vectors each)
```

**Time Estimate**:
- 50 users: ~10-15 minutes
- 100 users: ~20-30 minutes
- 500 users: ~1.5-2 hours

(Longer due to rate limiting on free HuggingFace tier)

### Step 4: Verify Migration

#### Check Pinecone Console
1. Go to your `users` index
2. Check vector count: Should be `2 × number of users`
3. Inspect vectors:
   - IDs should end with `_profile` or `_pref`
   - Metadata should include `vectorType: "profile"` or `"preference"`

#### Test Matching
```bash
pnpm test:matching <userId>
```

**Expected Output**:
```
🧪 Testing Vector Matching for User: <userId>

📊 User Profile:
   Name: John Doe
   Gender: male
   Looking for: female
   Distance preference: 25 km

🔍 Querying Pinecone index: users for bidirectional similarity
✅ Found 8 bidirectional matches
📍 5 matches within 25km distance preference

Top 5 Matches:
1. Jane Smith - Score: 82.5% - Distance: 12.3 km
2. Sarah Johnson - Score: 78.2% - Distance: 18.7 km
...
```

---

## 🎯 What Changed

### Old Format (Single Vector)
```
Vector ID: "690b266957468589cd23226d"
Type: Single embedding (profile + preferences combined)
Matching: Unidirectional (profile-to-profile)
```

### New Format (Dual Vectors)
```
Vector 1 ID: "690b266957468589cd23226d_profile"
  Type: Profile embedding (who the user IS)
  Used for: Matching against other users' preferences

Vector 2 ID: "690b266957468589cd23226d_pref"
  Type: Preference embedding (what the user WANTS)
  Used for: Matching against other users' profiles

Matching: Bidirectional (preferences ↔ profiles)
```

---

## 🚨 Troubleshooting

### Migration Fails with Rate Limit Error (429)

**Symptom**:
```
⚠️ Rate limit or server error, retrying in 1000ms... (2 retries left)
```

**Solution**: This is normal. The script has automatic retry logic. Wait for it to complete.

**If it fails completely**: Increase delay in migration script:
```typescript
// In scripts/migrateUsersToVectorDB.ts
await new Promise(resolve => setTimeout(resolve, 5000)); // Increase from 2000 to 5000
```

### Pinecone Index Not Found

**Error**:
```
⚠️ Pinecone index "users" does not exist
```

**Solution**: Create the index in Pinecone console (see Step 2 above)

### Embedding Dimension Mismatch

**Error**:
```
Vector dimension mismatch
```

**Solution**: Check your Pinecone index settings. Dimensions MUST be 1024.

### No Matches Found After Migration

**Symptom**: `pnpm test:matching` returns 0 matches

**Possible Causes**:
1. **No complete profiles**: Only complete profiles are returned in matches
   - Check: `db.users.find({ isProfileComplete: true }).count()`
2. **No users within distance**: Distance filtering is strict
   - Test with larger distance preference
3. **Migration incomplete**: Check Pinecone console for vector count

---

## 🔍 Verification Checklist

After migration, verify:

- [ ] Pinecone vector count = 2 × MongoDB user count
- [ ] All vector IDs end with `_profile` or `_pref`
- [ ] Metadata includes `vectorType` field
- [ ] Test matching returns results
- [ ] Distance filtering works (only returns matches within range)
- [ ] Only complete profiles appear in results
- [ ] Scores are calculated bidirectionally

---

## 📊 MongoDB Queries for Verification

### Count Total Users
```javascript
db.users.count()
```

### Count Complete Profiles
```javascript
db.users.find({ isProfileComplete: true }).count()
```

### Find Users for Testing
```javascript
db.users.find({ 
  isProfileComplete: true, 
  isMatch: false,
  'location.latitude': { $exists: true }
}).limit(5)
```

---

## ⏮️ Rollback (If Needed)

If you need to revert to the old system:

1. **Restore Code**:
   ```bash
   git revert <commit-hash>
   ```

2. **Re-run Old Migration**:
   - Use old migration script (single vector per user)
   - Or restore Pinecone index from backup

---

## 📞 Support

If you encounter issues:

1. Check server logs for error messages
2. Verify Pinecone console shows vectors
3. Test with `pnpm test:matching <userId>`
4. Review [BIDIRECTIONAL_MATCHING_UPGRADE.md](BIDIRECTIONAL_MATCHING_UPGRADE.md)

---

**Last Updated**: December 24, 2025  
**Migration Type**: Single Vector → Dual Vector (Profile + Preference)  
**Estimated Time**: 10-120 minutes (depends on user count)
