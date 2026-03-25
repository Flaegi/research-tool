// Gemini API integration for dynamic topic clustering.
// Uses the Gemini 2.0 Flash model via direct fetch calls.
// API key is stored in localStorage under GEMINI_KEY_STORAGE.

export const GEMINI_KEY_STORAGE = 'research-tool-gemini-key';

interface ClusterDef {
  label: string;
  keywords: string[];
}

/**
 * Calls Gemini Flash to generate thematic clusters for a research topic.
 * Returns an array of ClusterDef objects parsed from the model's JSON response.
 * Throws if the key is invalid or the response cannot be parsed.
 *
 * @param topic - The research topic entered by the user
 * @param apiKey - Gemini API key
 */
export async function fetchClustersFromGemini(
  topic: string,
  apiKey: string
): Promise<ClusterDef[]> {
  const prompt = `You are a research knowledge graph assistant.
Given a research topic, identify exactly 5 distinct thematic clusters that cover the most important dimensions of the topic.
For each cluster, provide:
- A short label (2-4 words, acts as the cluster territory name)
- Exactly 3 specific, precise keywords or concepts relevant to that cluster

Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Example format:
[
  {"label": "Theoretical Basis", "keywords": ["Concept A", "Concept B", "Concept C"]},
  {"label": "Applications", "keywords": ["Use Case X", "Method Y", "System Z"]}
]

Research topic: "${topic}"`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800,
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ?? `Gemini API error: ${response.status}`
    );
  }

  const data = await response.json();
  const rawText: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip any accidental markdown fences before parsing
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Response is not an array');
    return parsed as ClusterDef[];
  } catch {
    throw new Error(`Could not parse Gemini response: ${rawText.slice(0, 120)}`);
  }
}
