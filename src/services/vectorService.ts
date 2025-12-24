import { Pinecone } from "@pinecone-database/pinecone";
import { generateEmbedding } from "./embeddingService";
import { userProfileOnlyToText, userPreferencesToText } from "../utils/userToText";
import type { UserSchema } from "@models/userModel";
import process from "node:process";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const INDEX_NAME = process.env.PINECONE_INDEX || "users";

/**
 * Gets the Pinecone index instance
 */
function getIndex() {
  return pinecone.index(INDEX_NAME);
}

/**
 * Checks if Pinecone index is accessible and ready
 */
export async function checkPineconeHealth(): Promise<boolean> {
  try {
    const indexStats = await getIndex().describeIndexStats();
    console.log(`✅ Pinecone index "${INDEX_NAME}" is ready`);
    return true;
  } catch (error: any) {
    console.error(`⚠️  Pinecone index "${INDEX_NAME}" health check failed:`, error.message);
    return false;
  }
}

/**
 * Upserts a user's DUAL vectors (profile + preference) to Pinecone
 * @param user - The user document from MongoDB
 */
export async function upsertUserVector(user: any): Promise<void> {
  try {
    const userId = user._id.toString();

    // Generate TWO text representations
    const profileText = userProfileOnlyToText(user);
    const preferenceText = userPreferencesToText(user);

    // Generate TWO embeddings
    const [profileEmbedding, preferenceEmbedding] = await Promise.all([
      generateEmbedding(profileText),
      generateEmbedding(preferenceText),
    ]);

    // Prepare metadata
    const metadata = {
      userId,
      gender: user.gender || "",
      isProfileComplete: user.isProfileComplete || false,
      isMatch: user.isMatch || false,
      latitude: user.location?.latitude || 0,
      longitude: user.location?.longitude || 0,
      preferredGenders: Array.isArray(user.preferences?.gender)
        ? user.preferences.gender.join(",")
        : "",
      minAge: user.preferences?.age?.min || 18,
      maxAge: user.preferences?.age?.max || 100,
      preferredDistance: user.preferences?.distance || 0,
    };

    // Upsert BOTH vectors
    const vectors = [
      {
        id: `${userId}_profile`,
        values: profileEmbedding,
        metadata: { ...metadata, vectorType: "profile" },
      },
      {
        id: `${userId}_pref`,
        values: preferenceEmbedding,
        metadata: { ...metadata, vectorType: "preference" },
      },
    ];

    await getIndex().upsert(vectors);
    console.log(`✅ User ${userId} synced to Pinecone (profile + preferences)`);
  } catch (error: any) {
    console.error(`⚠️  Failed to sync user ${user._id} to Pinecone:`, error.message);
    // Don't throw - graceful degradation
  }
}

/**
 * Batch upserts multiple users to Pinecone
 * @param users - Array of user documents
 * @param batchSize - Number of users to process per batch (default: 10)
 */
export async function batchUpsertUserVectors(
  users: any[],
  batchSize: number = 10
): Promise<void> {
  const vectors: any[] = [];

  for (const user of users) {
    try {
      const userId = user._id.toString();

      // Generate TWO text representations
      const profileText = userProfileOnlyToText(user);
      const preferenceText = userPreferencesToText(user);

      // Generate TWO embeddings
      const [profileEmbedding, preferenceEmbedding] = await Promise.all([
        generateEmbedding(profileText),
        generateEmbedding(preferenceText),
      ]);

      // Prepare metadata
      const metadata = {
        userId,
        gender: user.gender || "",
        isProfileComplete: user.isProfileComplete || false,
        isMatch: user.isMatch || false,
        latitude: user.location?.latitude || 0,
        longitude: user.location?.longitude || 0,
        preferredGenders: Array.isArray(user.preferences?.gender)
          ? user.preferences.gender.join(",")
          : "",
        minAge: user.preferences?.age?.min || 18,
        maxAge: user.preferences?.age?.max || 100,
        preferredDistance: user.preferences?.distance || 0,
      };

      // Add BOTH vectors
      vectors.push(
        {
          id: `${userId}_profile`,
          values: profileEmbedding,
          metadata: { ...metadata, vectorType: "profile" },
        },
        {
          id: `${userId}_pref`,
          values: preferenceEmbedding,
          metadata: { ...metadata, vectorType: "preference" },
        }
      );

      // Upsert in batches
      if (vectors.length >= batchSize * 2) {
        await getIndex().upsert(vectors);
        console.log(`✅ Upserted batch (${vectors.length / 2} users × 2 vectors each)`);
        vectors.length = 0; // Clear array
      }
    } catch (error: any) {
      console.error(`⚠️  Failed to process user ${user._id}:`, error.message);
      continue;
    }
  }

  // Upsert remaining vectors
  if (vectors.length > 0) {
    await getIndex().upsert(vectors);
    console.log(`✅ Upserted final batch (${vectors.length / 2} users × 2 vectors each)`);
  }
}

/**
 * Deletes a user's DUAL vectors from Pinecone
 * @param userId - The user's MongoDB _id
 */
export async function deleteUserVector(userId: string): Promise<void> {
  try {
    await getIndex().deleteMany([`${userId}_profile`, `${userId}_pref`]);
    console.log(`✅ Deleted vectors for user ${userId}`);
  } catch (error: any) {
    console.error(`⚠️  Failed to delete vectors for user ${userId}:`, error.message);
  }
}

/**
 * Finds similar users using BIDIRECTIONAL vector similarity
 * @param sampleUser - The user to find matches for
 * @param candidateIds - Array of candidate user IDs to compare against
 * @param topK - Number of top matches to return
 * @returns Array of { userId, score } objects sorted by similarity
 */
export async function findSimilarUsers(
  sampleUser: any,
  candidateIds: string[],
  topK: number = 10
): Promise<{ userId: string; score: number }[]> {
  try {
    const sampleUserId = sampleUser._id.toString();

    // Generate embeddings for the sample user
    const sampleProfileText = userProfileOnlyToText(sampleUser);
    const samplePreferenceText = userPreferencesToText(sampleUser);

    const [sampleProfileEmbedding, samplePreferenceEmbedding] = await Promise.all([
      generateEmbedding(sampleProfileText),
      generateEmbedding(samplePreferenceText),
    ]);

    console.log(
      `🔍 Querying Pinecone index: ${INDEX_NAME} for bidirectional similarity`
    );

    // BIDIRECTIONAL MATCHING:
    // Query 1: My PREFERENCES vs Their PROFILES
    const query1Results = await getIndex().query({
      vector: samplePreferenceEmbedding,
      topK: candidateIds.length,
      includeMetadata: true,
      filter: {
        userId: { $in: candidateIds },
        vectorType: { $eq: "profile" },
      },
    });

    // Query 2: Their PREFERENCES vs My PROFILE
    const query2Results = await getIndex().query({
      vector: sampleProfileEmbedding,
      topK: candidateIds.length,
      includeMetadata: true,
      filter: {
        userId: { $in: candidateIds },
        vectorType: { $eq: "preference" },
      },
    });

    // Create maps for quick lookup
    const query1Map = new Map(
      query1Results.matches?.map((m) => [
        (m.metadata?.userId as string) || "",
        m.score || 0,
      ]) || []
    );

    const query2Map = new Map(
      query2Results.matches?.map((m) => [
        (m.metadata?.userId as string) || "",
        m.score || 0,
      ]) || []
    );

    // Combine scores bidirectionally
    const combinedScores: { userId: string; score: number }[] = [];

    for (const candidateId of candidateIds) {
      const score1 = query1Map.get(candidateId) || 0; // My prefs vs their profile
      const score2 = query2Map.get(candidateId) || 0; // Their prefs vs my profile

      // Only include if BOTH scores are > 0 (mutual compatibility)
      if (score1 > 0 && score2 > 0) {
        const avgScore = (score1 + score2) / 2;
        combinedScores.push({
          userId: candidateId,
          score: avgScore,
        });
      }
    }

    // Sort by combined score
    combinedScores.sort((a, b) => b.score - a.score);

    console.log(`✅ Found ${combinedScores.length} bidirectional matches`);

    return combinedScores.slice(0, topK);
  } catch (error: any) {
    console.error("⚠️  Vector search failed:", error.message);
    throw error;
  }
}
