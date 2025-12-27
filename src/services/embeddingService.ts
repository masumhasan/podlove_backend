import OpenAI from "openai";
import process from "node:process";

// Lazy initialization to ensure dotenv is loaded first
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY,
    });
  }
  return openai;
}

// Model for generating embeddings (OpenAI)
const EMBEDDING_MODEL = "text-embedding-3-small";

// Target dimension for Pinecone (custom dimension for text-embedding-3-small)
const TARGET_DIMENSION = 1024;

/**
 * Generates a single embedding vector from text using OpenAI's API
 * @param text - The text to embed
 * @param retries - Number of retries on rate limit (default: 3)
 * @returns Embedding vector (1024 dimensions)
 */
export async function generateEmbedding(
  text: string,
  retries: number = 3
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate embedding for empty text");
  }

  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: TARGET_DIMENSION,
    });

    // OpenAI returns exactly the specified dimensions
    const embedding = response.data[0].embedding;

    if (embedding.length !== TARGET_DIMENSION) {
      throw new Error(
        `Unexpected embedding dimension: ${embedding.length}, expected ${TARGET_DIMENSION}`
      );
    }

    return embedding;
  } catch (error: any) {
    // Handle rate limiting (429 errors)
    if (error.status === 429 && retries > 0) {
      const waitTime = Math.pow(2, 4 - retries) * 1000; // Exponential backoff: 1s, 2s, 4s
      console.warn(
        `⚠️  Rate limit hit, retrying in ${waitTime}ms... (${retries} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return generateEmbedding(text, retries - 1);
    }

    console.error("Error generating embedding:", error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generates embeddings for multiple texts in batch using OpenAI
 * @param texts - Array of texts to embed (up to 2048 texts per batch)
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // OpenAI supports batch requests, process all at once for efficiency
  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: TARGET_DIMENSION,
    });

    return response.data.map((item) => item.embedding);
  } catch (error: any) {
    // Fallback to individual requests if batch fails
    console.warn("Batch embedding failed, falling back to individual requests");
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await generateEmbedding(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }
}

/**
 * Validates that an embedding has the correct dimensions
 * @param embedding - The embedding vector to validate
 * @returns True if valid
 */
export function validateEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && embedding.length === TARGET_DIMENSION;
}
