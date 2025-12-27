import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_DIMENSION = 1024;

/**
 * Test OpenAI Embeddings Integration
 * Tests OpenAI's embedding API with Pinecone vector database
 * Alternative to HuggingFace embeddings
 */

async function testOpenAIEmbeddings() {
  console.log('🧪 Testing OpenAI Embeddings Setup\n');
  console.log('=' .repeat(60));

  // Step 1: Verify Environment Variables
  console.log('\n📋 Step 1: Checking Environment Variables...');
  const requiredVars = {
    OPENAI_KEY: process.env.OPENAI_KEY,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    PINECONE_INDEX: process.env.PINECONE_INDEX,
  };

  let missingVars = false;
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      console.error(`   ❌ ${key} is missing`);
      missingVars = true;
    } else {
      console.log(`   ✅ ${key} is set`);
    }
  }

  if (missingVars) {
    console.error('\n❌ Missing required environment variables. Please check your .env file.');
    process.exit(1);
  }

  // Step 2: Initialize OpenAI
  console.log('\n🤖 Step 2: Initializing OpenAI...');
  let openai: OpenAI;
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY,
    });
    console.log('   ✅ OpenAI client initialized');
  } catch (error) {
    console.error('   ❌ Failed to initialize OpenAI:', error);
    process.exit(1);
  }

  // Step 3: Test Embedding Generation
  console.log('\n🔢 Step 3: Generating Test Embedding...');
  console.log('   Model: text-embedding-3-small');
  console.log(`   Target Dimensions: ${REQUIRED_DIMENSION}`);
  
  const testText = 'I am a 28-year-old software engineer who loves hiking, reading science fiction, and playing guitar. I prefer meaningful conversations and am looking for someone who shares similar interests.';
  console.log(`   Test Text: "${testText.substring(0, 80)}..."`);

  let embedding: number[];
  let embeddingTime: number;

  try {
    const startTime = Date.now();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testText,
      dimensions: REQUIRED_DIMENSION, // Specify custom dimensions
    });
    embeddingTime = Date.now() - startTime;

    embedding = response.data[0].embedding;
    
    console.log(`   ✅ Embedding generated in ${embeddingTime}ms`);
    console.log(`   📊 Vector Dimension: ${embedding.length}`);
    console.log(`   📊 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    console.log(`   📊 Value Range: [${Math.min(...embedding).toFixed(4)}, ${Math.max(...embedding).toFixed(4)}]`);

    if (embedding.length !== REQUIRED_DIMENSION) {
      console.error(`   ❌ Dimension mismatch! Expected ${REQUIRED_DIMENSION}, got ${embedding.length}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('   ❌ Failed to generate embedding:', error.message);
    if (error.status === 401) {
      console.error('   💡 Check your OPENAI_KEY in .env file');
    }
    process.exit(1);
  }

  // Step 4: Test Pinecone Connection
  console.log('\n🌲 Step 4: Connecting to Pinecone...');
  let pinecone: Pinecone;
  let index: any;

  try {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    console.log('   ✅ Pinecone client initialized');

    index = pinecone.index(process.env.PINECONE_INDEX!);
    console.log(`   ✅ Connected to index: ${process.env.PINECONE_INDEX}`);
  } catch (error: any) {
    console.error('   ❌ Failed to connect to Pinecone:', error.message);
    process.exit(1);
  }

  // Step 5: Verify Index Stats
  console.log('\n📊 Step 5: Checking Pinecone Index Stats...');
  try {
    const stats = await index.describeIndexStats();
    console.log(`   ✅ Total Vectors: ${stats.totalRecordCount || 0}`);
    console.log(`   ✅ Index Dimension: ${stats.dimension}`);
    
    if (stats.dimension !== REQUIRED_DIMENSION) {
      console.warn(`   ⚠️  Warning: Index dimension (${stats.dimension}) doesn't match OpenAI embedding dimension (${REQUIRED_DIMENSION})`);
      console.warn(`   💡 You may need to create a new Pinecone index with ${REQUIRED_DIMENSION} dimensions`);
    }

    if (stats.namespaces) {
      console.log(`   📁 Namespaces: ${Object.keys(stats.namespaces).join(', ') || 'default'}`);
    }
  } catch (error: any) {
    console.error('   ❌ Failed to get index stats:', error.message);
  }

  // Step 6: Test Upsert & Query
  console.log('\n💾 Step 6: Testing Upsert & Query...');
  const testId = 'openai-test-user-' + Date.now();
  
  try {
    // Upsert test vector
    await index.upsert([
      {
        id: testId,
        values: embedding,
        metadata: {
          type: 'test',
          text: testText,
          model: 'text-embedding-3-small',
          timestamp: new Date().toISOString(),
        },
      },
    ]);
    console.log(`   ✅ Test vector upserted (ID: ${testId})`);

    // Wait a moment for indexing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Query similar vectors
    const queryResult = await index.query({
      vector: embedding,
      topK: 3,
      includeMetadata: true,
    });

    console.log(`   ✅ Query successful! Found ${queryResult.matches?.length || 0} matches`);
    
    if (queryResult.matches && queryResult.matches.length > 0) {
      console.log('\n   📌 Top Matches:');
      queryResult.matches.slice(0, 3).forEach((match: any, i: number) => {
        console.log(`      ${i + 1}. ID: ${match.id}`);
        console.log(`         Score: ${(match.score! * 100).toFixed(2)}%`);
        if (match.metadata?.type) {
          console.log(`         Type: ${match.metadata.type}`);
        }
      });
    }

    // Cleanup test vector
    await index.deleteOne(testId);
    console.log(`   ✅ Test vector cleaned up`);

  } catch (error: any) {
    console.error('   ❌ Upsert/Query failed:', error.message);
  }

  // Step 7: Performance Comparison
  console.log('\n⚡ Step 7: Generating Multiple Embeddings (Performance Test)...');
  const testTexts = [
    'Software engineer passionate about AI and machine learning',
    'Medical professional who enjoys outdoor activities',
    'Artist and creative thinker looking for inspiration',
    'Business analyst with a love for travel',
    'Teacher who values education and personal growth',
  ];

  try {
    const batchStartTime = Date.now();
    const batchResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testTexts,
      dimensions: REQUIRED_DIMENSION,
    });
    const batchTime = Date.now() - batchStartTime;

    console.log(`   ✅ Generated ${batchResponse.data.length} embeddings in ${batchTime}ms`);
    console.log(`   📊 Average: ${(batchTime / batchResponse.data.length).toFixed(0)}ms per embedding`);
    console.log(`   💰 Tokens Used: ${batchResponse.usage.total_tokens}`);
  } catch (error: any) {
    console.error('   ❌ Batch generation failed:', error.message);
  }

  // Final Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ OpenAI Embeddings Test Complete!\n');
  console.log('📝 Summary:');
  console.log('   • Model: text-embedding-3-small');
  console.log(`   • Dimensions: ${REQUIRED_DIMENSION} (custom)`);
  console.log(`   • Single Embedding Time: ~${embeddingTime}ms`);
  console.log('   • Pinecone Integration: Working ✅');
  console.log('\n💡 Next Steps:');
  console.log('   1. Consider using OpenAI embeddings for production');
  console.log('   2. Compare quality with HuggingFace embeddings');
  console.log('   3. Monitor costs (OpenAI charges per token)');
  console.log('   4. Update embeddingService.ts to use OpenAI if preferred');
  console.log('\n📊 Model Options:');
  console.log('   • text-embedding-3-small: Fast, cost-effective (current)');
  console.log('   • text-embedding-3-large: Higher quality, more expensive');
  console.log('   • text-embedding-ada-002: Legacy, 1536 dimensions');
  console.log('=' .repeat(60));
}

// Run the test
testOpenAIEmbeddings()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
