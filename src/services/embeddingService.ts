import { HfInference } from "@huggingface/inference";
import process from "node:process";

const hf = new HfInference(process.env.HUGGINGFACE_ACCESS_TOKEN);

// Model for generating embeddings (FREE on HuggingFace)
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";

// Target dimension for Pinecone (HuggingFace native dimension)
const TARGET_DIMENSION = 1024;

/**
 * Generates a single embedding vector from text using HuggingFace's inference API
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
    const response = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: text,
    });

    // HuggingFace returns 1024 dimensions - ensure it's a flat array
    let embedding: number[];
    if (Array.isArray(response)) {
      // If it's nested, flatten it
      embedding = response.flat(Infinity) as number[];
    } else {
      embedding = [response as number];
    }

    // Return exactly TARGET_DIMENSION elements
    return embedding.slice(0, TARGET_DIMENSION);
  } catch (error: any) {
    // Handle rate limiting (429 errors)
    if (error.response?.status === 429 && retries > 0) {
      const waitTime = Math.pow(2, 4 - retries) * 1000; // Exponential backoff: 1s, 2s, 4s
      console.warn(
        `⚠️  Rate limit or server error, retrying in ${waitTime}ms... (${retries} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return generateEmbedding(text, retries - 1);
    }

    console.error("Error generating embedding:", error.message);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Generates embeddings for multiple texts in batch
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Validates that an embedding has the correct dimensions
 * @param embedding - The embedding vector to validate
 * @returns True if valid
 */
export function validateEmbedding(embedding: number[]): boolean {
  return Array.isArray(embedding) && embedding.length === TARGET_DIMENSION;
}
