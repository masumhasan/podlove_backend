import mongoose from "mongoose";
import User from "../src/models/userModel";
import { checkPineconeHealth, batchUpsertUserVectors } from "../src/services/vectorService";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function migrateUsers() {
  console.log("🚀 Starting user migration to Pinecone...");

  try {
    // 1. Connect to MongoDB
    console.log("📦 Connecting to MongoDB...");
    await mongoose.connect(process.env.ATLAS_URI!);
    console.log("✅ Connected to MongoDB");

    // 2. Check Pinecone health
    console.log("🔍 Checking Pinecone health...");
    const isHealthy = await checkPineconeHealth();
    if (!isHealthy) {
      throw new Error("Pinecone index is not ready");
    }

    // 3. Fetch ALL users (complete and incomplete profiles)
    console.log("📊 Fetching ALL users (complete and incomplete profiles)...");
    const users = await User.find({}).lean();
    console.log(`Found ${users.length} users total`);

    if (users.length === 0) {
      console.log("No users to migrate");
      await mongoose.disconnect();
      return;
    }

    // 4. Batch upsert to Pinecone
    console.log("🔄 Upserting users to Pinecone...");
    
    // Process in batches of 10 users with delays to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      await batchUpsertUserVectors(batch, batchSize);
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < users.length) {
        console.log(`⏳ Processed ${i + batch.length}/${users.length}, waiting 2s to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log("✅ Migration completed successfully!");
    console.log(`Total vectors created: ${users.length * 2} (${users.length} users × 2 vectors each)`);

    // 5. Disconnect
    await mongoose.disconnect();
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateUsers();
