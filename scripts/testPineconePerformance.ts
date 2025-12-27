import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
import { generateEmbedding, generateEmbeddings } from '../src/services/embeddingService';

dotenv.config();

interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
}

class PineconePerformanceTester {
  private pinecone: Pinecone;
  private indexName: string;
  private metrics: PerformanceMetrics[] = [];

  constructor() {
    this.indexName = process.env.PINECONE_INDEX || 'users';
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }

  private recordMetric(operation: string, startTime: number, endTime: number, success: boolean, error?: string) {
    this.metrics.push({
      operation,
      startTime,
      endTime,
      duration: endTime - startTime,
      success,
      error,
    });
  }

  private async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const endTime = Date.now();
      this.recordMetric(operation, startTime, endTime, true);
      return result;
    } catch (error: any) {
      const endTime = Date.now();
      this.recordMetric(operation, startTime, endTime, false, error.message);
      throw error;
    }
  }

  async testConnectionLatency() {
    console.log('\n🔗 Testing Pinecone Connection Latency...');
    console.log('─'.repeat(80));

    try {
      const index = this.pinecone.index(this.indexName);
      
      // Test 1: Basic connection
      const stats = await this.measure('Connection Check', async () => {
        return await index.describeIndexStats();
      });

      const lastMetric = this.metrics[this.metrics.length - 1];
      console.log(`✅ Connection successful`);
      console.log(`   • Response Time: ${lastMetric.duration}ms`);
      console.log(`   • Index Name: ${this.indexName}`);
      console.log(`   • Total Vectors: ${stats.totalRecordCount || 0}`);
      console.log(`   • Index Dimension: ${stats.dimension}`);
      
      if (stats.namespaces) {
        console.log(`   • Namespaces: ${Object.keys(stats.namespaces).length}`);
      }

    } catch (error: any) {
      console.error(`❌ Connection failed: ${error.message}`);
      throw error;
    }
  }

  async testEmbeddingGeneration() {
    console.log('\n🤖 Testing OpenAI Embedding Generation...');
    console.log('─'.repeat(80));

    const testTexts = [
      'Software engineer who loves hiking and outdoor activities',
      'Medical professional passionate about fitness and wellness',
      'Creative artist with interest in photography and travel',
    ];

    try {
      // Test single embedding
      console.log('\n📊 Single Embedding Test:');
      const singleResult = await this.measure('Generate Single Embedding', async () => {
        return await generateEmbedding(testTexts[0]);
      });

      const singleMetric = this.metrics[this.metrics.length - 1];
      console.log(`   ✅ Generated ${singleResult.length}-dimensional vector`);
      console.log(`   • Response Time: ${singleMetric.duration}ms`);
      console.log(`   • Throughput: ${(1000 / singleMetric.duration).toFixed(2)} embeddings/sec`);

      // Test batch embeddings
      console.log('\n📊 Batch Embedding Test (3 texts):');
      const batchResult = await this.measure('Generate Batch Embeddings', async () => {
        return await generateEmbeddings(testTexts);
      });

      const batchMetric = this.metrics[this.metrics.length - 1];
      console.log(`   ✅ Generated ${batchResult.length} embeddings`);
      console.log(`   • Total Time: ${batchMetric.duration}ms`);
      console.log(`   • Avg per Embedding: ${(batchMetric.duration / batchResult.length).toFixed(0)}ms`);
      console.log(`   • Throughput: ${(batchResult.length * 1000 / batchMetric.duration).toFixed(2)} embeddings/sec`);

    } catch (error: any) {
      console.error(`❌ Embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  async testVectorUpsert() {
    console.log('\n💾 Testing Vector Upsert Performance...');
    console.log('─'.repeat(80));

    const index = this.pinecone.index(this.indexName);
    const testVectors: any[] = [];

    try {
      // Generate test vectors
      console.log('\n📝 Preparing test vectors...');
      const embedding = await generateEmbedding('Test user profile for performance testing');
      
      for (let i = 0; i < 5; i++) {
        testVectors.push({
          id: `perf-test-${Date.now()}-${i}`,
          values: embedding,
          metadata: {
            type: 'performance-test',
            testIndex: i,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Test single upsert
      console.log('\n📊 Single Vector Upsert:');
      await this.measure('Upsert Single Vector', async () => {
        return await index.upsert([testVectors[0]]);
      });

      const singleMetric = this.metrics[this.metrics.length - 1];
      console.log(`   ✅ Vector upserted successfully`);
      console.log(`   • Response Time: ${singleMetric.duration}ms`);

      // Test batch upsert
      console.log('\n📊 Batch Vector Upsert (5 vectors):');
      await this.measure('Upsert Batch Vectors', async () => {
        return await index.upsert(testVectors);
      });

      const batchMetric = this.metrics[this.metrics.length - 1];
      console.log(`   ✅ ${testVectors.length} vectors upserted`);
      console.log(`   • Total Time: ${batchMetric.duration}ms`);
      console.log(`   • Avg per Vector: ${(batchMetric.duration / testVectors.length).toFixed(0)}ms`);
      console.log(`   • Throughput: ${(testVectors.length * 1000 / batchMetric.duration).toFixed(2)} vectors/sec`);

      // Cleanup
      console.log('\n🧹 Cleaning up test vectors...');
      const vectorIds = testVectors.map(v => v.id);
      await index.deleteMany(vectorIds);

    } catch (error: any) {
      console.error(`❌ Vector upsert failed: ${error.message}`);
      throw error;
    }
  }

  async testVectorQuery() {
    console.log('\n🔍 Testing Vector Query Performance...');
    console.log('─'.repeat(80));

    const index = this.pinecone.index(this.indexName);

    try {
      // Generate query vector
      const queryVector = await generateEmbedding('Looking for someone who enjoys fitness and outdoor activities');

      // Test query with different topK values
      const topKValues = [5, 10, 20];

      for (const topK of topKValues) {
        console.log(`\n📊 Query with topK=${topK}:`);
        
        const result = await this.measure(`Query Top ${topK}`, async () => {
          return await index.query({
            vector: queryVector,
            topK,
            includeMetadata: true,
          });
        });

        const metric = this.metrics[this.metrics.length - 1];
        console.log(`   ✅ Found ${result.matches?.length || 0} matches`);
        console.log(`   • Response Time: ${metric.duration}ms`);
        console.log(`   • Latency per Result: ${(metric.duration / topK).toFixed(2)}ms`);
        
        if (result.matches && result.matches.length > 0) {
          const topScore = result.matches[0].score || 0;
          console.log(`   • Top Score: ${(topScore * 100).toFixed(2)}%`);
        }
      }

      // Test query with filter
      console.log('\n📊 Query with Metadata Filter:');
      await this.measure('Query with Filter', async () => {
        return await index.query({
          vector: queryVector,
          topK: 5,
          includeMetadata: true,
          filter: {
            type: { $eq: 'profile' }
          }
        });
      });

      const filterMetric = this.metrics[this.metrics.length - 1];
      console.log(`   ✅ Query completed`);
      console.log(`   • Response Time: ${filterMetric.duration}ms`);

    } catch (error: any) {
      console.error(`❌ Vector query failed: ${error.message}`);
      throw error;
    }
  }

  async testEndToEndLatency() {
    console.log('\n⚡ Testing End-to-End Matching Latency...');
    console.log('─'.repeat(80));

    const index = this.pinecone.index(this.indexName);

    try {
      console.log('\n📊 Complete Matching Pipeline:');
      console.log('   (Embedding → Upsert → Query → Cleanup)');
      
      const pipelineStart = Date.now();

      // Step 1: Generate embedding
      const step1Start = Date.now();
      const embedding = await generateEmbedding('Test user seeking adventure and meaningful connections');
      const step1Time = Date.now() - step1Start;

      // Step 2: Upsert vector
      const step2Start = Date.now();
      const testId = `e2e-test-${Date.now()}`;
      await index.upsert([{
        id: testId,
        values: embedding,
        metadata: { type: 'e2e-test' }
      }]);
      const step2Time = Date.now() - step2Start;

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Query
      const step3Start = Date.now();
      const result = await index.query({
        vector: embedding,
        topK: 5,
        includeMetadata: true,
      });
      const step3Time = Date.now() - step3Start;

      // Step 4: Cleanup
      const step4Start = Date.now();
      await index.deleteOne(testId);
      const step4Time = Date.now() - step4Start;

      const totalTime = Date.now() - pipelineStart;

      console.log('\n   ✅ Pipeline completed successfully');
      console.log('\n   📈 Breakdown:');
      console.log(`      • Generate Embedding: ${step1Time}ms (${(step1Time/totalTime*100).toFixed(1)}%)`);
      console.log(`      • Upsert Vector: ${step2Time}ms (${(step2Time/totalTime*100).toFixed(1)}%)`);
      console.log(`      • Query Matches: ${step3Time}ms (${(step3Time/totalTime*100).toFixed(1)}%)`);
      console.log(`      • Cleanup: ${step4Time}ms (${(step4Time/totalTime*100).toFixed(1)}%)`);
      console.log(`      • Wait Time: 1000ms`);
      console.log(`   ─────────────────────────────`);
      console.log(`      • Total Time: ${totalTime}ms`);
      console.log(`      • Active Time: ${step1Time + step2Time + step3Time + step4Time}ms`);
      console.log(`\n   📊 Results: Found ${result.matches?.length || 0} matches`);

    } catch (error: any) {
      console.error(`❌ End-to-end test failed: ${error.message}`);
      throw error;
    }
  }

  printSummary() {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('═'.repeat(80));

    const successCount = this.metrics.filter(m => m.success).length;
    const failureCount = this.metrics.filter(m => !m.success).length;
    const avgDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length;

    console.log('\n📈 Overall Statistics:');
    console.log(`   • Total Operations: ${this.metrics.length}`);
    console.log(`   • Successful: ${successCount} (${(successCount/this.metrics.length*100).toFixed(1)}%)`);
    console.log(`   • Failed: ${failureCount}`);
    console.log(`   • Average Duration: ${avgDuration.toFixed(0)}ms`);

    console.log('\n⚡ Operation Details:');
    
    // Group by operation type
    const grouped = this.metrics.reduce((acc, m) => {
      if (!acc[m.operation]) {
        acc[m.operation] = [];
      }
      acc[m.operation].push(m);
      return acc;
    }, {} as Record<string, PerformanceMetrics[]>);

    Object.entries(grouped).forEach(([operation, metrics]) => {
      const avg = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const min = Math.min(...metrics.map(m => m.duration));
      const max = Math.max(...metrics.map(m => m.duration));
      const success = metrics.filter(m => m.success).length;

      console.log(`\n   ${operation}:`);
      console.log(`      • Calls: ${metrics.length}`);
      console.log(`      • Success Rate: ${(success/metrics.length*100).toFixed(1)}%`);
      console.log(`      • Avg: ${avg.toFixed(0)}ms`);
      console.log(`      • Min: ${min}ms`);
      console.log(`      • Max: ${max}ms`);
    });

    console.log('\n' + '═'.repeat(80));
  }

  printRecommendations() {
    console.log('\n💡 RECOMMENDATIONS');
    console.log('═'.repeat(80));

    const avgEmbeddingTime = this.metrics
      .filter(m => m.operation.includes('Embedding'))
      .reduce((sum, m) => sum + m.duration, 0) / this.metrics.filter(m => m.operation.includes('Embedding')).length;

    const avgQueryTime = this.metrics
      .filter(m => m.operation.includes('Query'))
      .reduce((sum, m) => sum + m.duration, 0) / this.metrics.filter(m => m.operation.includes('Query')).length;

    console.log('\n🎯 Performance Analysis:\n');

    if (avgEmbeddingTime > 500) {
      console.log('   ⚠️  OpenAI Embedding generation is slow (>500ms avg)');
      console.log('      → Consider caching embeddings for frequently used texts');
      console.log('      → Use batch operations when possible');
    } else {
      console.log('   ✅ OpenAI Embedding generation is fast (<500ms avg)');
    }

    if (avgQueryTime > 200) {
      console.log('\n   ⚠️  Pinecone queries are slow (>200ms avg)');
      console.log('      → Check Pinecone region (use closest to your server)');
      console.log('      → Consider reducing topK value');
      console.log('      → Use metadata filters sparingly');
    } else {
      console.log('\n   ✅ Pinecone queries are fast (<200ms avg)');
    }

    const failedOps = this.metrics.filter(m => !m.success);
    if (failedOps.length > 0) {
      console.log('\n   ❌ Failed Operations Detected:');
      failedOps.forEach(op => {
        console.log(`      • ${op.operation}: ${op.error}`);
      });
    }

    console.log('\n📚 Best Practices:');
    console.log('   • Use batch operations for multiple vectors (5-10x faster)');
    console.log('   • Cache embeddings to avoid redundant API calls');
    console.log('   • Set appropriate topK values (10-20 is usually sufficient)');
    console.log('   • Monitor rate limits (OpenAI: 3000 RPM, Pinecone: varies by plan)');
    console.log('   • Use connection pooling for high-traffic applications');

    console.log('\n' + '═'.repeat(80));
  }
}

async function runPerformanceTests() {
  console.log('🚀 Pinecone Matching Performance Test');
  console.log('═'.repeat(80));
  console.log(`📅 Test Date: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Index: ${process.env.PINECONE_INDEX || 'users'}`);

  const tester = new PineconePerformanceTester();

  try {
    await tester.testConnectionLatency();
    await tester.testEmbeddingGeneration();
    await tester.testVectorUpsert();
    await tester.testVectorQuery();
    await tester.testEndToEndLatency();

    tester.printSummary();
    tester.printRecommendations();

    console.log('\n✅ All performance tests completed successfully!\n');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ Performance test failed:', error.message);
    tester.printSummary();
    process.exit(1);
  }
}

runPerformanceTests();
