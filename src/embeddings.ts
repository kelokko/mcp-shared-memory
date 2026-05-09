/**
 * OpenAI Embeddings
 * 
 * Generates vector embeddings for text using OpenAI's API.
 */

export async function createEmbedding(
  text: string,
  apiKey: string,
  model: string = "text-embedding-3-small"
): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}
