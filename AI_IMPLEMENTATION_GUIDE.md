# Complete AI Matching Implementation Guide

This guide provides step-by-step instructions to implement the **bidirectional AI-powered matching system** in a fresh repository. Follow these steps to replicate the entire AI matching functionality.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Dependencies Installation](#dependencies-installation)
3. [Environment Configuration](#environment-configuration)
4. [Pinecone Setup](#pinecone-setup)
5. [File Structure](#file-structure)
6. [Create New Files](#create-new-files)
7. [Modify Existing Files](#modify-existing-files)
8. [Testing Setup](#testing-setup)
9. [Migration and Deployment](#migration-and-deployment)
10. [Verification](#verification)

---

## Prerequisites

### Required Accounts (All Free Tier Available)

1. **HuggingFace Account**
   - Sign up: https://huggingface.co/
   - Create access token: https://huggingface.co/settings/tokens
   - Select "Read" access
   - Copy token starting with `hf_...`

2. **Pinecone Account**
   - Sign up: https://www.pinecone.io/
   - Free tier: 1 index, 100K vectors
   - Get API key from console

3. **MongoDB Database**
   - Already required for your app
   - Should have User model with profiles

### Existing Code Requirements

Your application must have:
- MongoDB with User model
- User preferences (gender, age, bodyType, ethnicity, distance)
- User location (latitude, longitude)
- Compatibility answers array (optional but recommended)
- TypeScript/Node.js backend

---

## Dependencies Installation

### 1. Install Required Packages

```bash
npm install @pinecone-database/pinecone @huggingface/inference
# or
pnpm add @pinecone-database/pinecone @huggingface/inference
```

### 2. Verify Installation

Check `package.json` includes:
```json
{
  "dependencies": {
    "@pinecone-database/pinecone": "^3.x.x",
    "@huggingface/inference": "^2.x.x"
  }
}
```

---

## Environment Configuration

### 1. Add Environment Variables

Add to your `.env` file:

```env
# HuggingFace (Free Embeddings)
HUGGINGFACE_ACCESS_TOKEN=hf_your_token_here

# Pinecone Vector Database
PINECONE_API_KEY=pcsk_your_api_key_here
PINECONE_INDEX=users
```

### 2. Update package.json Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "vector:test": "ts-node -r tsconfig-paths/register scripts/testVectorSetup.ts",
    "vector:migrate": "ts-node -r tsconfig-paths/register scripts/migrateUsersToVectorDB.ts",
    "test:matching": "ts-node -r tsconfig-paths/register scripts/testMatching.ts"
  }
}
```

---

## Pinecone Setup

### Create Pinecone Index

1. Go to https://app.pinecone.io/
2. Click "Create Index"
3. Configure:
   - **Name**: `users`
   - **Dimensions**: `2048`
   - **Metric**: `cosine`
   - **Cloud**: AWS
   - **Region**: `us-east-1` (or closest to you)
4. Wait for "Ready" status (~2 minutes)

---

## File Structure

You will create these new files:

```
project-root/
├── src/
│   ├── services/
│   │   ├── embeddingService.ts          # NEW
│   │   ├── vectorService.ts             # NEW
│   │   └── matchesServices.ts           # MODIFY
│   └── utils/
│       └── userToText.ts                # NEW
├── scripts/
│   ├── migrateUsersToVectorDB.ts       # NEW
│   ├── testVectorSetup.ts              # NEW
│   ├── testMatching.ts                 # NEW
│   └── checkUsers.ts                   # NEW (optional)
└── (documentation files)                # NEW
```

---

## Create New Files

### 1. Embedding Service (`src/services/embeddingService.ts`)

Create this file to handle HuggingFace embeddings:

```typescript
import { HfInference } from "@huggingface/inference";
import process from "node:process";

const hf = new HfInference(process.env.HUGGINGFACE_ACCESS_TOKEN);

// Use HuggingFace's free embedding model that outputs 1024 dimensions
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";
const MODEL_OUTPUT_DIMENSION = 1024; // Model's native output
const EMBEDDING_DIMENSION = 2048; // Target dimension for Pinecone index

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Pad embedding from 1024 to 2048 dimensions
 * Uses zero-padding for the additional dimensions
 */
function padEmbedding(embedding: number[]): number[] {
  if (embedding.length === EMBEDDING_DIMENSION) {
    return embedding;
  }
  
  if (embedding.length !== MODEL_OUTPUT_DIMENSION) {
    throw new Error(`Expected ${MODEL_OUTPUT_DIMENSION} dimensions from model, got ${embedding.length}`);
  }
  
  // Pad with zeros to reach target dimension
  const paddingSize = EMBEDDING_DIMENSION - MODEL_OUTPUT_DIMENSION;
  const paddedEmbedding = [...embedding, ...new Array(paddingSize).fill(0)];
  
  return paddedEmbedding;
}

/**
 * Sleep for a specified number of milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = INITIAL_RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0) {
      throw error;
    }

    // Check if it's a rate limit error (429) or server error (5xx)
    const isRetryable = error.status === 429 || (error.status >= 500 && error.status < 600);
    
    if (!isRetryable) {
      throw error;
    }

    console.warn(`⚠️  Rate limit or server error, retrying in ${delay}ms... (${retries} retries left)`);
    await sleep(delay);
    
    // Exponential backoff: double the delay for next retry
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

/**
 * Generate an embedding vector for the given text
 * @param text - The text to convert to an embedding
 * @returns A numeric vector representing the semantic meaning
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate embedding for empty text");
  }

  return retryWithBackoff(async () => {
    try {
      const response = await hf.featureExtraction({
        model: EMBEDDING_MODEL,
        inputs: text.trim(),
      });

      // HuggingFace returns the embedding directly as an array
      const embedding = Array.isArray(response) ? response : (response as any);
      
      if (!Array.isArray(embedding)) {
        throw new Error(`Expected array response, got ${typeof embedding}`);
      }

      // Pad embedding from model's native dimension to target dimension
      const paddedEmbedding = padEmbedding(embedding);

      return paddedEmbedding;
    } catch (error: any) {
      console.error("Error generating embedding:", error.message);
      throw error;
    }
  });
}

/**
 * Generate embeddings for multiple texts in a single batch
 * @param texts - Array of texts to convert to embeddings
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    throw new Error("Cannot generate embeddings for empty array");
  }

  const validTexts = texts.filter((t) => t && t.trim().length > 0);
  if (validTexts.length === 0) {
    throw new Error("All texts are empty");
  }

  // HuggingFace Inference API: process texts one by one to avoid rate limits
  // For batch processing, we'll use sequential calls with retry logic
  const embeddings: number[][] = [];
  
  for (const text of validTexts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
    
    // Small delay between requests to avoid rate limits
    if (embeddings.length < validTexts.length) {
      await sleep(200); // 200ms between requests
    }
  }

  return embeddings;
}

export const EmbeddingService = {
  generateEmbedding,
  generateEmbeddings,
  EMBEDDING_DIMENSION,
};
```

---

### 2. User-to-Text Converter (`src/utils/userToText.ts`)

Create this file to convert user profiles to semantic text:

```typescript
/**
 * Convert user preferences to semantic text
 * This captures what the user is looking for in a match
 */
export function userPreferencesToText(user: any): string {
  const parts: string[] = [];
  
  if (!user.preferences) {
    return "No preferences specified";
  }

  const pref = user.preferences;
  
  parts.push("Looking for:");
  
  if (pref.gender && pref.gender.length > 0) {
    parts.push(`Gender: ${pref.gender.join(", ")}`);
  }
  
  if (pref.age) {
    parts.push(`Age: ${pref.age.min} to ${pref.age.max} years old`);
  }
  
  if (pref.bodyType && pref.bodyType.length > 0) {
    parts.push(`Body type: ${pref.bodyType.join(", ")}`);
  }
  
  if (pref.ethnicity && pref.ethnicity.length > 0) {
    parts.push(`Ethnicity: ${pref.ethnicity.join(", ")}`);
  }
  
  if (pref.distance) {
    parts.push(`Within ${pref.distance} km distance`);
  }

  return parts.join(". ");
}

/**
 * Convert user profile to semantic text (without preferences)
 * This captures who the user IS (for matching against other users' preferences)
 */
export function userProfileOnlyToText(user: any): string {
  const parts: string[] = [];

  // Basic Demographics
  if (user.name) parts.push(`Name: ${user.name}`);
  if (user.gender) parts.push(`Gender: ${user.gender}`);
  if (user.dateOfBirth) parts.push(`Date of Birth: ${user.dateOfBirth}`);
  if (user.bodyType) parts.push(`Body Type: ${user.bodyType}`);
  if (user.ethnicity && user.ethnicity.length > 0) {
    parts.push(`Ethnicity: ${user.ethnicity.join(", ")}`);
  }

  // Bio
  if (user.bio) parts.push(`Bio: ${user.bio}`);

  // Personality
  if (user.personality) {
    const { spectrum, balance, focus } = user.personality;
    parts.push(`Personality - Spectrum: ${spectrum}, Balance: ${balance}, Focus: ${focus}`);
  }

  // Interests
  if (user.interests && user.interests.length > 0) {
    parts.push(`Interests: ${user.interests.join(", ")}`);
  }

  // Location
  if (user.location && user.location.place) {
    parts.push(`Location: ${user.location.place}`);
  }

  // Compatibility Answers (Most Important)
  if (user.compatibility && user.compatibility.length > 0) {
    parts.push("Compatibility Profile:");
    
    const questions = [
      "Socializing preference",
      "Decision making approach",
      "Preferred activities",
      "Importance of personal growth",
      "Show affection style",
      "Ideal future vision",
      "Has kids",
      "Wants kids count",
      "Will date someone with kids",
      "Smoking status",
      "Will date a smoker",
      "Drinking habits",
      "Comfortable dating a drinker",
      "Religious/spiritual status",
      "Religion/denomination",
      "Spiritual beliefs",
      "Importance of religion/spirituality",
      "Date different beliefs",
      "Political engagement level",
      "Date different political beliefs",
      "Has pets",
      "Pet type",
      "Spontaneity importance",
      "Communication style",
      "Ideal weekend activity",
      "Leisure preference",
      "Trying new things",
      "Conflict resolution",
      "Relationship roles",
      "Family connection importance",
      "Shared values importance",
      "Social openness",
      "Relationship foundation",
      "Stress handling",
      "Financial approach",
      "Risk taking",
      "Health importance",
      "Pet preference",
      "Disagreement handling",
      "Physical intimacy timeline",
      "Public affection comfort",
      "Daily rhythm",
      "Organization style",
    ];

    user.compatibility.forEach((answer: string | null, index: number) => {
      if (answer && answer !== "null" && answer !== null) {
        const question = questions[index] || `Q${index + 1}`;
        parts.push(`- ${question}: ${answer}`);
      }
    });
  }

  return parts.join("\n");
}

/**
 * Convert a user profile to a semantic text representation
 * for embedding generation. This captures all relevant aspects
 * of the user's profile that matter for matchmaking.
 */
export function userProfileToText(user: any): string {
  const profileText = userProfileOnlyToText(user);
  const preferencesText = userPreferencesToText(user);
  
  return `${profileText}\n\n${preferencesText}`;
}

export const UserTextConverter = {
  userProfileToText,
  userPreferencesToText,
  userProfileOnlyToText,
};
```

**⚠️ IMPORTANT**: Adjust the `questions` array in `userProfileOnlyToText()` to match your actual compatibility questions.

---

### 3. Vector Service (`src/services/vectorService.ts`)

Create this file (THIS IS LONG - CONTINUED IN NEXT SECTION):

```typescript
import { Pinecone } from "@pinecone-database/pinecone";
import process from "node:process";
import { generateEmbedding } from "./embeddingService";
import { 
  userProfileToText, 
  userPreferencesToText,
  userProfileOnlyToText 
} from "@utils/userToText";

// Initialize Pinecone client
let pineconeClient: Pinecone | null = null;

function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY is not set in environment variables");
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

function getIndexName(): string {
  const indexName = process.env.PINECONE_INDEX;
  if (!indexName) {
    throw new Error("PINECONE_INDEX is not set in environment variables");
  }
  return indexName;
}

/**
 * Upsert a user's vectors into Pinecone
 * Stores TWO vectors per user:
 * 1. Profile vector (userId_profile) - who the user IS
 * 2. Preference vector (userId_pref) - what the user WANTS
 * 
 * @param userId - MongoDB _id as string
 * @param userProfile - Full user document from MongoDB
 */
export async function upsertUserVector(userId: string, userProfile: any): Promise<void> {
  try {
    // Store ALL profiles in Pinecone (complete and incomplete)
    // Filtering for complete profiles happens during matching

    // Generate TWO embeddings: one for profile, one for preferences
    const profileOnlyText = userProfileOnlyToText(userProfile);
    const preferencesText = userPreferencesToText(userProfile);

    const [profileEmbedding, preferenceEmbedding] = await Promise.all([
      generateEmbedding(profileOnlyText),
      generateEmbedding(preferencesText),
    ]);

    // Get Pinecone index
    const pc = getPineconeClient();
    const indexName = getIndexName();
    console.log(`📊 Connecting to Pinecone index: ${indexName}`);
    const index = pc.index(indexName);

    // Prepare metadata (lightweight - only for filtering)
    const metadata: Record<string, any> = {
      userId: userId,
      gender: userProfile.gender || "",
      isProfileComplete: userProfile.isProfileComplete || false,
      isMatch: userProfile.isMatch || false,
    };

    // Add location if available
    if (userProfile.location?.latitude && userProfile.location?.longitude) {
      metadata.latitude = userProfile.location.latitude;
      metadata.longitude = userProfile.location.longitude;
    }

    // Add preferences for potential filtering
    if (userProfile.preferences) {
      if (userProfile.preferences.gender) {
        metadata.preferredGenders = userProfile.preferences.gender.join(",");
      }
      if (userProfile.preferences.age) {
        metadata.minAge = userProfile.preferences.age.min;
        metadata.maxAge = userProfile.preferences.age.max;
      }
      if (userProfile.preferences.distance) {
        metadata.preferredDistance = userProfile.preferences.distance;
      }
    }

    // Upsert BOTH vectors to Pinecone
    await index.upsert([
      {
        id: `${userId}_profile`, // Profile vector - who they ARE
        values: profileEmbedding,
        metadata: { ...metadata, vectorType: "profile" },
      },
      {
        id: `${userId}_pref`, // Preference vector - what they WANT
        values: preferenceEmbedding,
        metadata: { ...metadata, vectorType: "preference" },
      },
    ]);

    console.log(`✅ Successfully upserted user ${userId} (profile + preferences) to Pinecone`);
  } catch (error: any) {
    console.error(`Error upserting user ${userId} to Pinecone:`, error.message);
    throw error;
  }
}

/**
 * Delete a user's vectors from Pinecone (both profile and preference)
 * @param userId - MongoDB _id as string
 */
export async function deleteUserVector(userId: string): Promise<void> {
  try {
    const pc = getPineconeClient();
    const index = pc.index(getIndexName());

    // Delete both vectors
    await index.deleteMany([`${userId}_profile`, `${userId}_pref`]);
    console.log(`✅ Deleted user ${userId} vectors (profile + preference) from Pinecone`);
  } catch (error: any) {
    console.error(`Error deleting user ${userId} from Pinecone:`, error.message);
    throw error;
  }
}

/**
 * Find similar users using BIDIRECTIONAL vector similarity search
 * Matches user's PREFERENCES against candidates' PROFILES 
 * AND candidates' PREFERENCES against user's PROFILE
 * 
 * @param userProfile - The user's profile to find matches for
 * @param candidateIds - Array of MongoDB user IDs to search within (pre-filtered by MongoDB)
 * @param topK - Number of top matches to return
 * @returns Array of {userId, score} sorted by combined similarity score
 */
export async function findSimilarUsers(
  userProfile: any,
  candidateIds: string[],
  topK: number = 10
): Promise<Array<{ userId: string; score: number }>> {
  try {
    if (candidateIds.length === 0) {
      return [];
    }

    // Generate TWO query embeddings:
    // 1. User's preferences (to match against candidates' profiles)
    // 2. User's profile (to match against candidates' preferences)
    const userPreferencesText = userPreferencesToText(userProfile);
    const userProfileText = userProfileOnlyToText(userProfile);

    const [userPrefEmbedding, userProfileEmbedding] = await Promise.all([
      generateEmbedding(userPreferencesText),
      generateEmbedding(userProfileText),
    ]);

    // Get Pinecone index
    const pc = getPineconeClient();
    const indexName = getIndexName();
    console.log(`🔍 Querying Pinecone index: ${indexName} for bidirectional similarity`);
    const index = pc.index(indexName);

    const userId = userProfile._id.toString();

    // Query 1: User's PREFERENCES vs Candidates' PROFILES
    // "What I want" matched against "who they are"
    const query1 = index.query({
      vector: userPrefEmbedding,
      topK: Math.min(topK * 3, 150),
      includeMetadata: true,
      filter: {
        userId: { $in: candidateIds },
        vectorType: "profile", // Match against their profiles
      },
    });

    // Query 2: Candidates' PREFERENCES vs User's PROFILE
    // "What they want" matched against "who I am"
    const query2 = index.query({
      vector: userProfileEmbedding,
      topK: Math.min(topK * 3, 150),
      includeMetadata: true,
      filter: {
        userId: { $in: candidateIds },
        vectorType: "preference", // Match against their preferences
      },
    });

    const [response1, response2] = await Promise.all([query1, query2]);

    // Combine scores from both queries
    const scoreMap = new Map<string, { score1: number; score2: number }>();

    // Process query 1 results (my preferences vs their profiles)
    response1.matches.forEach((match) => {
      // Extract userId from vector ID (format: userId_profile)
      const candidateUserId = match.id.replace("_profile", "");
      if (candidateUserId !== userId && candidateIds.includes(candidateUserId)) {
        const existing = scoreMap.get(candidateUserId) || { score1: 0, score2: 0 };
        existing.score1 = match.score || 0;
        scoreMap.set(candidateUserId, existing);
      }
    });

    // Process query 2 results (their preferences vs my profile)
    response2.matches.forEach((match) => {
      // Extract userId from vector ID (format: userId_pref)
      const candidateUserId = match.id.replace("_pref", "");
      if (candidateUserId !== userId && candidateIds.includes(candidateUserId)) {
        const existing = scoreMap.get(candidateUserId) || { score1: 0, score2: 0 };
        existing.score2 = match.score || 0;
        scoreMap.set(candidateUserId, existing);
      }
    });

    // Calculate combined score (average of both directions)
    // Both must have non-zero scores for a match to be valid
    const results = Array.from(scoreMap.entries())
      .map(([userId, scores]) => ({
        userId,
        score1: scores.score1,
        score2: scores.score2,
        // Combined score: average of both, but only if both are > 0
        score: scores.score1 > 0 && scores.score2 > 0 
          ? (scores.score1 + scores.score2) / 2
          : 0,
      }))
      .filter((result) => result.score > 0) // Only keep bidirectional matches
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ userId, score }) => ({ userId, score }));

    console.log(`✅ Found ${results.length} bidirectional matches (my prefs vs their profile AND their prefs vs my profile)`);
    return results;
  } catch (error: any) {
    console.error("Error finding similar users:", error.message);
    throw error;
  }
}

/**
 * Check if Pinecone index is healthy and ready
 */
export async function checkPineconeHealth(): Promise<boolean> {
  try {
    const pc = getPineconeClient();
    const indexName = getIndexName();
    
    const indexDescription = await pc.describeIndex(indexName);
    
    if (indexDescription.status?.ready) {
      console.log(`✅ Pinecone index "${indexName}" is ready`);
      console.log(`   - Dimension: ${indexDescription.dimension}`);
      console.log(`   - Metric: ${indexDescription.metric}`);
      return true;
    } else {
      console.warn(`⚠️  Pinecone index "${indexName}" is not ready yet`);
      return false;
    }
  } catch (error: any) {
    console.error("Error checking Pinecone health:", error.message);
    return false;
  }
}

export const VectorService = {
  upsertUserVector,
  deleteUserVector,
  findSimilarUsers,
  checkPineconeHealth,
};
```

---

### 4. Create Test Scripts

#### `scripts/testVectorSetup.ts`

```typescript
import dotenv from "dotenv";
dotenv.config();

import { checkPineconeHealth } from "../src/services/vectorService";
import { generateEmbedding } from "../src/services/embeddingService";
import { userProfileToText, userPreferencesToText } from "../src/utils/userToText";

async function testSetup() {
  console.log("\n🧪 Testing Vector Matching Setup\n");

  // 1. Check environment variables
  console.log("1️⃣  Checking environment variables...");
  const requiredEnvVars = [
    "HUGGINGFACE_ACCESS_TOKEN",
    "PINECONE_API_KEY",
    "PINECONE_INDEX",
  ];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error(`   ❌ Missing environment variables: ${missingVars.join(", ")}`);
    process.exit(1);
  }
  console.log("   ✅ All environment variables present\n");

  // 2. Check Pinecone connection
  console.log("2️⃣  Checking Pinecone connection...");
  const isHealthy = await checkPineconeHealth();
  if (!isHealthy) {
    console.error("   ❌ Pinecone health check failed");
    process.exit(1);
  }
  console.log("");

  // 3. Test embedding generation
  console.log("3️⃣  Testing HuggingFace embedding generation...");
  try {
    const testText = "Hello, this is a test for embedding generation.";
    const embedding = await generateEmbedding(testText);
    console.log(`   ✅ Embedding generated successfully (${embedding.length} dimensions)\n`);
  } catch (error: any) {
    console.error(`   ❌ Embedding generation failed: ${error.message}`);
    process.exit(1);
  }

  // 4. Test user profile conversion
  console.log("4️⃣  Testing user profile conversion...");
  const mockUser = {
    name: "Test User",
    gender: "male",
    bio: "Test bio",
    interests: ["reading", "hiking"],
    location: { place: "New York" },
    preferences: {
      gender: ["female"],
      age: { min: 25, max: 35 },
      distance: 25,
    },
  };

  try {
    const profileText = userProfileToText(mockUser);
    const prefText = userPreferencesToText(mockUser);
    console.log(`   ✅ Profile text generated (${profileText.length} chars)`);
    console.log(`   ✅ Preference text generated (${prefText.length} chars)\n`);
  } catch (error: any) {
    console.error(`   ❌ Profile conversion failed: ${error.message}`);
    process.exit(1);
  }

  console.log("✅ All tests passed! Vector matching setup is ready.\n");
}

testSetup().catch(console.error);
```

#### `scripts/testMatching.ts`

```typescript
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "../src/models/userModel"; // Adjust path as needed
import { findSimilarUsers } from "../src/services/vectorService";

async function testMatching() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: pnpm test:matching <userId>");
    process.exit(1);
  }

  console.log(`\n🧪 Testing Vector Matching for User: ${userId}\n`);

  // Connect to MongoDB
  await mongoose.connect(process.env.ATLAS_URI!);
  console.log("✅ Connected to MongoDB\n");

  // Load user
  const user = await User.findById(userId).lean();
  if (!user) {
    console.error(`❌ User ${userId} not found`);
    process.exit(1);
  }

  console.log("📊 User Profile:");
  console.log(`   Name: ${user.name}`);
  console.log(`   Gender: ${user.gender}`);
  console.log(`   Looking for: ${user.preferences?.gender?.join(", ")}`);
  console.log(`   Distance preference: ${user.preferences?.distance} km\n`);

  // Find matches
  const candidates = await User.find({
    _id: { $ne: user._id },
    isProfileComplete: true,
    isMatch: false,
  }).lean();

  const candidateIds = candidates.map((c: any) => c._id.toString());

  console.log(`📊 Found ${candidateIds.length} potential candidates\n`);

  const matches = await findSimilarUsers(user, candidateIds, 5);

  console.log(`\n✅ Top ${matches.length} Matches:\n`);

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchUser = candidates.find((c: any) => c._id.toString() === match.userId);
    if (matchUser) {
      console.log(`${i + 1}. ${(matchUser as any).name} - Score: ${(match.score * 100).toFixed(1)}%`);
    }
  }

  console.log("\n");
  await mongoose.disconnect();
}

testMatching().catch(console.error);
```

#### `scripts/migrateUsersToVectorDB.ts`

```typescript
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "../src/models/userModel"; // Adjust path
import { upsertUserVector, checkPineconeHealth } from "../src/services/vectorService";

async function migrateUsers() {
  console.log("\n🚀 Starting user migration to Pinecone...\n");

  // Connect to MongoDB
  console.log("📦 Connecting to MongoDB...");
  await mongoose.connect(process.env.ATLAS_URI!);
  console.log("✅ Connected to MongoDB\n");

  // Check Pinecone health
  console.log("🔍 Checking Pinecone health...");
  const isHealthy = await checkPineconeHealth();
  if (!isHealthy) {
    throw new Error("Pinecone is not healthy");
  }
  console.log("");

  // Fetch ALL users (complete and incomplete)
  console.log("📊 Fetching ALL users (complete and incomplete profiles)...");
  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users total\n`);

  console.log("🔄 Upserting users to Pinecone...");

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const userId = (user._id as any).toString();

    try {
      await upsertUserVector(userId, user);
      successCount++;

      // Rate limiting: add delay every 10 users
      if ((i + 1) % 10 === 0) {
        console.log(`⏳ Processed ${i + 1}/${users.length}, waiting 2s to avoid rate limits...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`❌ Error upserting user ${userId}:`, error.message);
      errorCount++;
    }
  }

  console.log("\n✅ Migration completed!");
  console.log(`   Success: ${successCount} users (${successCount * 2} vectors)`);
  console.log(`   Errors: ${errorCount} users\n`);

  await mongoose.disconnect();
  console.log("👋 Disconnected from MongoDB\n");
}

migrateUsers().catch(console.error);
```

---

## Modify Existing Files

### 1. Update `src/services/matchesServices.ts`

Add the import at the top:

```typescript
import { findSimilarUsers } from "./vectorService";
```

Find your `findMatches` function and update it:

```typescript
async function findMatches(
  userId: string, 
  answers: string[], 
  limitCount: number, 
  session: mongoose.ClientSession
): Promise<any[]> {
  // 1) Load user
  const user = await User.findById(userId, {}, { session });
  if (!user) throw new Error("User not found");

  // 2) Ensure answers array
  answers = answers?.length ? answers : user.compatibility || [];

  // 3) Save/update user's compatibility answers
  await User.findByIdAndUpdate(userId, { compatibility: answers }, { session }).exec();

  const pref = user.preferences;

  // 4) Fetch candidates matching preferences (MongoDB hard filters)
  // MUST have complete profiles for matching
  let candidates = await User.find({
    _id: { $ne: user._id },
    isProfileComplete: true, // Only complete profiles can be matched
    dateOfBirth: { $gte: ageToDOB(pref.age.max), $lte: ageToDOB(pref.age.min) },
    gender: { $in: pref.gender },
    bodyType: { $in: pref.bodyType },
    isMatch: false,
    ethnicity: { $in: pref.ethnicity },
    "location.latitude": { $exists: true },
    "location.longitude": { $exists: true },
  }, null, { session }
  ).lean();

  console.log(`📊 Found ${candidates.length} complete profile candidates matching filters`);

  // 5) Try vector-based similarity search (AI-powered bidirectional matching)
  let scored: Array<{ user: any; score: number }> = [];
  
  try {
    // Get candidate IDs for Pinecone filtering
    const candidateIds = candidates.map((c) => c._id.toString());
    
    if (candidateIds.length > 0) {
      // Use Pinecone bidirectional matching
      const vectorMatches = await findSimilarUsers(user, candidateIds, limitCount * 3);
      
      if (vectorMatches.length > 0) {
        // Map vector scores back to user objects
        const scoreMap = new Map(vectorMatches.map((vm) => [vm.userId, vm.score]));
        
        scored = candidates
          .map((c) => ({
            user: c,
            score: (scoreMap.get(c._id.toString()) || 0) * 100, // Normalize to 0-100
          }))
          .filter((item) => item.score > 0);
        
        console.log(`✅ Using bidirectional vector similarity scores for ${scored.length} candidates`);
      }
    }
  } catch (error: any) {
    console.warn("⚠️  Vector search failed, falling back to OpenAI compatibility:", error.message);
  }

  // 6) Fallback to OpenAI compatibility scoring if vector search didn't work
  if (scored.length === 0) {
    // YOUR EXISTING FALLBACK LOGIC HERE
    // e.g., OpenAI compatibility scoring
  }

  // 7) STRICT distance filtering AFTER scoring
  const scoredWithDistance = scored.filter((item) => {
    const dist = calculateDistance(
      user.location.latitude,
      user.location.longitude,
      item.user.location.latitude,
      item.user.location.longitude
    );
    const withinRange = dist <= pref.distance;
    
    if (!withinRange) {
      console.log(`❌ Filtered out ${item.user._id} (distance: ${dist.toFixed(1)}km > ${pref.distance}km preference)`);
    }
    
    return withinRange;
  });

  console.log(`📍 ${scoredWithDistance.length} matches within ${pref.distance}km distance preference`);

  // 8) Sort & return top matches
  return scoredWithDistance
    .sort((a, b) => b.score - a.score)
    .slice(0, limitCount)
    .map((item) => ({
      user: item.user._id,
      score: item.score ?? 0,
    }));
}
```

---

### 2. Add Sync Hooks to Controllers

#### `src/controllers/userController.ts`

Add import at top:
```typescript
import { upsertUserVector } from "@services/vectorService";
```

In your `update()` function, after successful update:

```typescript
// After: await session.commitTransaction();
// Add this:

// Upsert to Pinecone vector DB (non-blocking)
// Store all profiles (complete and incomplete)
upsertUserVector(userId, user)
  .then(() => console.log(`✅ User ${userId} synced to Pinecone`))
  .catch((err) => console.error(`⚠️  Failed to sync user ${userId} to Pinecone:`, err.message));
```

#### `src/controllers/authController.ts`

Add import:
```typescript
import { upsertUserVector } from "@services/vectorService";
```

In your `register()` function, after user save:

```typescript
// After: await user.save();
// Add this:

// Sync to Pinecone (non-blocking) - store all profiles
const userId = (user._id as any).toString();
upsertUserVector(userId, user)
  .then(() => console.log(`✅ User ${userId} synced to Pinecone after registration`))
  .catch((err) => console.error(`⚠️  Failed to sync user ${userId} to Pinecone:`, err.message));
```

#### `src/services/userServices.ts`

If you have a bio validation service, add:

```typescript
import { upsertUserVector } from "./vectorService";

// In validateBio or similar function, after save:
upsertUserVector(userId, updatedUserBio)
  .then(() => console.log(`✅ User ${userId} synced to Pinecone after bio update`))
  .catch((err) => console.error(`⚠️  Failed to sync user ${userId} to Pinecone:`, err.message));
```

---

## Testing Setup

### 1. Test Vector Setup

```bash
pnpm vector:test
```

Expected output:
```
✅ All environment variables present
✅ Pinecone index "users" is ready
✅ Embedding generated successfully (2048 dimensions)
✅ All tests passed!
```

### 2. Run Migration

```bash
pnpm vector:migrate
```

This will index all existing users to Pinecone.

### 3. Test Matching

```bash
pnpm test:matching <userId>
```

Replace `<userId>` with an actual user ID from your database.

---

## Migration and Deployment

### Step 1: Backup

Before deploying:
1. Backup your MongoDB database
2. Document current Pinecone index state (if any)

### Step 2: Deploy Code

1. Deploy all new files to your server
2. Ensure environment variables are set
3. Restart your application

### Step 3: Run Migration

```bash
# On production server
pnpm vector:migrate
```

This will:
- Index all users to Pinecone (2 vectors per user)
- Take 10-40 minutes depending on user count
- Handle rate limits automatically

---

## Verification

### 1. Check Pinecone Console

- Go to https://app.pinecone.io/
- Verify vector count = `2 × number of users`
- Check vector IDs end with `_profile` or `_pref`

### 2. Test Matching

```bash
pnpm test:matching <userId>
```

Should show:
- Bidirectional matching results
- Distance filtering
- Similarity scores

### 3. Monitor Logs

Watch for:
```
✅ User XXX synced to Pinecone (profile + preferences)
✅ Found X bidirectional matches
📍 X matches within Xkm distance preference
```

---

## Common Issues & Solutions

### Issue: Rate Limit (429)

**Solution**: Increase delays in migration script:
```typescript
await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s instead of 2s
```

### Issue: Dimension Mismatch

**Solution**: Verify Pinecone index has dimensions = 2048

### Issue: No Matches Found

**Causes**:
1. No complete profiles (`isProfileComplete: false`)
2. Distance filtering too strict
3. Migration not completed

**Solution**: Check MongoDB for complete profiles:
```javascript
db.users.find({ isProfileComplete: true }).count()
```

---

## Performance Considerations

### Storage
- 2 vectors per user
- 2048 dimensions per vector
- ~10KB per user

### Query Speed
- 2 Pinecone queries (parallel)
- ~100-200ms total latency

### Costs (Free Tier)
- HuggingFace: FREE
- Pinecone: FREE up to 100K vectors

---

## Next Steps

1. Monitor matching quality
2. Collect user feedback
3. Fine-tune distance filtering if needed
4. Consider upgrading to paid tiers as you scale

---

## Support

Refer to these documents in the original repo:
- `BIDIRECTIONAL_MATCHING_UPGRADE.md` - Technical details
- `MIGRATION_INSTRUCTIONS.md` - Migration guide
- `VECTOR_MATCHING_README.md` - Architecture overview

---

**Implementation Checklist**

- [ ] Install dependencies
- [ ] Add environment variables
- [ ] Create Pinecone index
- [ ] Create new files (embeddingService, vectorService, userToText)
- [ ] Create test scripts
- [ ] Modify matchesServices
- [ ] Add sync hooks to controllers
- [ ] Test vector setup
- [ ] Run migration
- [ ] Test matching
- [ ] Verify Pinecone console
- [ ] Monitor production logs

---

**Last Updated**: December 24, 2025  
**Implementation Type**: Bidirectional AI Matching  
**Estimated Time**: 2-4 hours (including testing and migration)
