/**
 * Test Script: Find Top 5 Matching Users
 * 
 * This script demonstrates the AI-powered matching system by finding
 * the top 5 most compatible users for a given test user.
 * 
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/testMatching.ts [userId]
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import User from "../src/models/userModel";
import { findSimilarUsers } from "../src/services/vectorService";
import { userProfileToText } from "../src/utils/userToText";
import { calculateDistance } from "../src/utils/calculateDistanceUtils";
import { ageToDOB } from "../src/utils/ageUtils";

async function testMatching() {
  console.log("🎯 Testing AI-Powered Matching System\n");

  try {
    // 1) Connect to MongoDB
    const mongoUri = process.env.ATLAS_URI;
    if (!mongoUri) {
      throw new Error("ATLAS_URI not found in environment variables");
    }

    console.log("📦 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // 2) Get test user ID from command line or use first user
    let testUserId = process.argv[2];
    
    if (!testUserId) {
      console.log("No user ID provided, finding a test user...");
      const testUser = await User.findOne({ 
        isProfileComplete: true,
        isMatch: false,
        "preferences.gender": { $exists: true },
        "location.latitude": { $exists: true }
      }).lean();
      
      if (!testUser) {
        console.log("❌ No suitable test user found");
        return;
      }
      
      testUserId = testUser._id.toString();
    }

    console.log(`🔍 Finding matches for user: ${testUserId}\n`);

    // 3) Load the test user
    const user = await User.findById(testUserId).lean();
    if (!user) {
      console.log(`❌ User ${testUserId} not found`);
      return;
    }

    console.log("👤 Test User Profile:");
    console.log(`   Name: ${user.name}`);
    console.log(`   Gender: ${user.gender}`);
    console.log(`   Date of Birth: ${user.dateOfBirth}`);
    console.log(`   Location: ${user.location?.place || "Not set"}`);
    console.log(`   Bio: ${user.bio || "No bio"}\n`);
    
    console.log("🎯 Preferences:");
    console.log(`   Looking for: ${user.preferences?.gender?.join(", ") || "Not set"}`);
    console.log(`   Age range: ${user.preferences?.age?.min || "?"} - ${user.preferences?.age?.max || "?"}`);
    console.log(`   Distance: within ${user.preferences?.distance || "?"} km`);
    console.log(`   Body type: ${Array.isArray(user.preferences?.bodyType) ? user.preferences.bodyType.join(", ") : "Not set"}`);
    console.log(`   Ethnicity: ${Array.isArray(user.preferences?.ethnicity) ? user.preferences.ethnicity.join(", ") : "Not set"}\n`);

    // 4) Apply MongoDB filters to get candidates
    const pref = user.preferences;
    
    // Normalize gender preferences for case-insensitive matching
    const genderPrefs = pref.gender?.map((g: string) => new RegExp(`^${g}$`, 'i')) || [];
    
    let candidates = await User.find({
      _id: { $ne: user._id },
      gender: genderPrefs.length > 0 ? { $in: genderPrefs } : { $exists: true },
      "location.latitude": { $exists: true },
      "location.longitude": { $exists: true },
      isProfileComplete: true
    }).lean();

    console.log(`📊 Found ${candidates.length} candidates matching basic filters`);

    if (candidates.length === 0) {
      console.log("❌ No candidates found. Database might be empty or no other complete profiles exist.");
      return;
    }

    console.log();

    // 5) Filter by distance
    const nearby = candidates.filter((c) => {
      const dist = calculateDistance(
        user.location.latitude,
        user.location.longitude,
        c.location.latitude,
        c.location.longitude
      );
      return dist <= pref.distance;
    });

    console.log(`📍 After distance filter: ${nearby.length} candidates within ${pref.distance}km\n`);

    const finalCandidates = nearby.length > 0 ? nearby : candidates.slice(0, 20);

    // 6) Use AI vector similarity to rank matches
    console.log("🤖 Running AI similarity matching...\n");
    
    const candidateIds = finalCandidates.map((c) => c._id.toString());
    const vectorMatches = await findSimilarUsers(user, candidateIds, 5);

    if (vectorMatches.length === 0) {
      console.log("⚠️  Vector matching failed, showing random candidates instead");
      const randomMatches = finalCandidates.slice(0, 5);
      displayMatches(randomMatches, user, false);
      return;
    }

    // 7) Get full user details for top matches
    const topMatchIds = vectorMatches.map((m) => m.userId);
    const topMatches = await User.find({
      _id: { $in: topMatchIds }
    }).lean();

    // 8) Create scored matches with details
    const scoreMap = new Map(vectorMatches.map((m) => [m.userId, m.score]));
    const scoredMatches = topMatches
      .map((match) => ({
        ...match,
        matchScore: (scoreMap.get(match._id.toString()) || 0) * 100
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    // 9) Display results
    displayMatches(scoredMatches, user, true);

    console.log("\n✨ Matching test completed successfully!");

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("\n👋 Disconnected from MongoDB");
  }
}

function displayMatches(matches: any[], testUser: any, hasScores: boolean) {
  console.log("═".repeat(80));
  console.log(`🏆 TOP ${matches.length} MATCHING USERS`);
  console.log("═".repeat(80));

  // Helper function to calculate age from date of birth
  const calculateAge = (dob: string): number => {
    if (!dob) return 0;
    
    // Parse date in DD/MM/YYYY or D/M/YYYY format
    const parts = dob.split('/');
    if (parts.length !== 3) return 0;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
    const year = parseInt(parts[2], 10);
    
    if (isNaN(day) || isNaN(month) || isNaN(year)) return 0;
    
    const birthDate = new Date(year, month, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  matches.forEach((match, index) => {
    const distance = calculateDistance(
      testUser.location.latitude,
      testUser.location.longitude,
      match.location.latitude,
      match.location.longitude
    );

    console.log(`\n${index + 1}. ${match.name || "Unknown"}`);
    console.log("─".repeat(80));
    
    if (hasScores) {
      console.log(`   🎯 Match Score: ${match.matchScore?.toFixed(1)}%`);
    }
    
    const age = match.dateOfBirth ? calculateAge(match.dateOfBirth) : null;
    
    console.log(`   👤 Gender: ${match.gender || "Not specified"}`);
    console.log(`   📅 Age: ${age !== null ? age : "Not specified"}`);
    console.log(`   🏋️ Body Type: ${match.bodyType || "Not specified"}`);
    console.log(`   🌍 Ethnicity: ${Array.isArray(match.ethnicity) ? match.ethnicity.join(", ") : "Not specified"}`);
    console.log(`   📍 Location: ${match.location?.place || "Not specified"}`);
    console.log(`   📏 Distance: ${distance.toFixed(1)} km`);
    console.log(`   📝 Bio: ${match.bio || "No bio available"}`);
    
    if (match.interests && match.interests.length > 0) {
      console.log(`   ❤️  Interests: ${match.interests.join(", ")}`);
    }
    
    if (match.personality) {
      console.log(`   🧠 Personality: Spectrum ${match.personality.spectrum}, Balance ${match.personality.balance}, Focus ${match.personality.focus}`);
    }

    // Show compatibility highlights
    if (match.compatibility && match.compatibility.length > 0) {
      const compatAnswers = match.compatibility.filter((a: any) => a && a !== "null");
      console.log(`   💬 Compatibility Answers: ${compatAnswers.length} questions answered`);
    }
  });

  console.log("\n" + "═".repeat(80));
}

// Run the test
testMatching()
  .then(() => {
    console.log("✅ Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  });
