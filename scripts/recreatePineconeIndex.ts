import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const INDEX_NAME = process.env.PINECONE_INDEX || 'users';
const TARGET_DIMENSION = 1024;

async function recreateIndex() {
  console.log('🔧 Recreating Pinecone Index with 1024 dimensions\n');
  console.log('=' .repeat(60));

  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  try {
    // Step 1: Check if index exists
    console.log(`\n📋 Checking if index "${INDEX_NAME}" exists...`);
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some(idx => idx.name === INDEX_NAME);

    if (indexExists) {
      console.log(`✅ Index "${INDEX_NAME}" exists`);
      
      // Step 2: Delete existing index
      console.log(`\n🗑️  Deleting existing index "${INDEX_NAME}"...`);
      await pinecone.deleteIndex(INDEX_NAME);
      console.log(`✅ Index deleted`);
      
      // Wait for deletion to complete
      console.log('⏳ Waiting for deletion to complete (10 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      console.log(`ℹ️  Index "${INDEX_NAME}" does not exist`);
    }

    // Step 3: Create new index with 1024 dimensions
    console.log(`\n🆕 Creating new index "${INDEX_NAME}" with ${TARGET_DIMENSION} dimensions...`);
    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: TARGET_DIMENSION,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    });
    console.log(`✅ Index created successfully`);

    // Wait for index to be ready
    console.log('\n⏳ Waiting for index to be ready (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Step 4: Verify index
    console.log(`\n✅ Verifying index "${INDEX_NAME}"...`);
    const index = pinecone.index(INDEX_NAME);
    const stats = await index.describeIndexStats();
    console.log(`   • Dimension: ${stats.dimension}`);
    console.log(`   • Total Vectors: ${stats.totalRecordCount || 0}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Index Recreation Complete!\n');
    console.log('📝 Next Steps:');
    console.log('   1. Run: pnpm vector:test');
    console.log('   2. Run: pnpm vector:migrate');
    console.log('=' .repeat(60));

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Alternative: Manually delete and recreate in Pinecone Console');
    console.error('   1. Go to https://app.pinecone.io');
    console.error('   2. Delete the existing index');
    console.error(`   3. Create new index: Name="${INDEX_NAME}", Dimension=${TARGET_DIMENSION}, Metric=cosine`);
    process.exit(1);
  }
}

recreateIndex()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
