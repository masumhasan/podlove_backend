import dotenv from "dotenv";
import { checkPineconeHealth } from "../src/services/vectorService";
import { generateEmbedding, validateEmbedding } from "../src/services/embeddingService";
import { userProfileOnlyToText, userPreferencesToText } from "../src/utils/userToText";

// Load environment variables
dotenv.config();

async function testVectorSetup() {
  console.log("🧪 Testing Vector Matching Setup\n");

  // 1. Check environment variables
  console.log("1️⃣  Checking environment variables...");
  const requiredEnvVars = [
    "OPENAI_KEY",
    "PINECONE_API_KEY",
    "PINECONE_INDEX",
  ];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error("   ❌ Missing environment variables:", missingVars.join(", "));
    process.exit(1);
  }

  console.log("   ✅ All environment variables present\n");

  // 2. Check Pinecone connection
  console.log("2️⃣  Checking Pinecone connection...");
  try {
    const isHealthy = await checkPineconeHealth();
    if (!isHealthy) {
      console.error("   ❌ Pinecone index is not ready");
      process.exit(1);
    }
    console.log("");
  } catch (error: any) {
    console.error("   ❌ Pinecone connection failed:", error.message);
    process.exit(1);
  }

  // 3. Test OpenAI embedding generation
  console.log("3️⃣  Testing OpenAI embedding generation...");
  try {
    const testText = "I am a 28-year-old software engineer who loves hiking and photography.";
    const embedding = await generateEmbedding(testText);

    if (!validateEmbedding(embedding)) {
      console.error("   ❌ Invalid embedding dimensions");
      process.exit(1);
    }

    console.log(`   ✅ Embedding generated successfully (${embedding.length} dimensions with padding)\n`);
  } catch (error: any) {
    console.error("   ❌ Embedding generation failed:", error.message);
    process.exit(1);
  }

  // 4. Test user profile conversion
  console.log("4️⃣  Testing user profile conversion...");
  try {
    const mockUser = {
      _id: "test123",
      name: "John Doe",
      gender: "male",
      dateOfBirth: "1995-05-15",
      bodyType: "Athletic",
      ethnicity: ["Caucasian"],
      bio: "I love outdoor adventures and trying new cuisines.",
      personality: {
        spectrum: 5,
        balance: 6,
        focus: 4,
      },
      interests: ["hiking", "photography", "cooking"],
      location: {
        place: "San Francisco, CA",
        latitude: 37.7749,
        longitude: -122.4194,
      },
      compatibility: [
        "Socializing in larger gatherings",
        "Follow my head (logic)",
        "Outdoor adventures",
        // ... more answers
      ],
      preferences: {
        gender: ["female"],
        age: { min: 25, max: 32 },
        bodyType: ["Athletic", "Fit"],
        ethnicity: ["Any"],
        distance: 25,
      },
    };

    const profileText = userProfileOnlyToText(mockUser);
    const preferenceText = userPreferencesToText(mockUser);

    console.log(`   ✅ Profile text generated (${profileText.length} chars)`);
    console.log(`   ✅ Preference text generated (${preferenceText.length} chars)\n`);
  } catch (error: any) {
    console.error("   ❌ User profile conversion failed:", error.message);
    process.exit(1);
  }

  console.log("✅ All tests passed! Vector matching setup is ready.\n");
}

// Run tests
testVectorSetup();
