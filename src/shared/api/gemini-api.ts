// Gemini API integration for dynamic topic clustering and drill-down expansion.
// Uses the Gemini 2.0 Flash model via direct fetch calls.
// API key is stored in localStorage under GEMINI_KEY_STORAGE.

export const GEMINI_KEY_STORAGE = 'research-tool-gemini-key';

export interface ClusterDef {
  label: string;
  keywords: string[];
}

export interface SubTopicDef {
  title: string;
  concept: string;
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
For each cluster provide:
- A short label (2-4 words, acts as the cluster territory name)
- Exactly 3 specific, precise keywords or concepts relevant to that cluster

Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Example format:
[
  {"label": "Theoretical Basis", "keywords": ["Concept A", "Concept B", "Concept C"]},
  {"label": "Applications", "keywords": ["Use Case X", "Method Y", "System Z"]}
]

Research topic: "${topic}"`;

  return callGemini<ClusterDef[]>(prompt, apiKey);
}

/**
 * Calls Gemini Flash to generate 4 specific sub-topics for a given keyword node.
 * Used for drill-down expansion when the user clicks "+" on a node.
 *
 * @param parentTitle - The title of the node being expanded
 * @param apiKey - Gemini API key
 */
export async function fetchSubTopicsFromGemini(
  parentTitle: string,
  apiKey: string
): Promise<SubTopicDef[]> {
  const prompt = `You are a research knowledge graph assistant.
Given a research concept, identify exactly 4 specific and distinct sub-topics or deeper aspects of it.
For each sub-topic provide:
- A short title (2-5 words, precise and specific)
- A one-sentence concept description (max 20 words)

Return ONLY a valid JSON array with no markdown, no explanation, no code fences. Example format:
[
  {"title": "Specific Aspect A", "concept": "How this aspect relates to the parent concept in detail."},
  {"title": "Specific Aspect B", "concept": "A precise explanation of this sub-topic and its significance."}
]

Parent concept: "${parentTitle}"`;

  return callGemini<SubTopicDef[]>(prompt, apiKey);
}

/**
 * Shared Gemini fetch helper. Strips markdown fences and parses JSON.
 */
async function callGemini<T>(prompt: string, apiKey: string): Promise<T> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
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
    return parsed as T;
  } catch {
    throw new Error(`Could not parse Gemini response: ${rawText.slice(0, 120)}`);
  }
}

/**
 * Shared Gemini fetch helper for plain text responses (no JSON parsing).
 */
export async function callGeminiText(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
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
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

/**
 * Generates a professional explanation for a research concept at a given detail level.
 * Level 1 = brief (2-3 sentences). Level 2 = medium (default). Level 3 = comprehensive (4 paragraphs + sources).
 *
 * @param title - The concept title to explain
 * @param apiKey - Gemini API key
 * @param level - Detail level: 1 (brief), 2 (standard), 3 (deep)
 */
export async function fetchExplanation(
  title: string,
  apiKey: string,
  level: 1 | 2 | 3 = 2
): Promise<string> {
  let prompt: string;

  if (level === 1) {
    prompt = `You are a research analyst. In exactly 2-3 clear sentences (max 300 characters), summarize what "${title}" is and why it matters. No sources needed. Be direct and factual.`;
  } else if (level === 3) {
    prompt = `You are an elite research analyst. Write a comprehensive, professional deep-dive on "${title}".
Structure: 4 well-developed paragraphs covering (1) definition & origins, (2) key mechanisms or principles, (3) current frontiers & controversies, (4) real-world applications & impact.
LENGTH: 2000-2800 characters. End every paragraph with a complete sentence.
SOURCES: Conclude with "SOURCES:" on a new line, then 3-4 specific reputable sources (nature.com, arxiv.org, science.org, relevant university pages). Include the full URL if known.`;
  } else {
    prompt = `You are an elite research analyst. Provide a comprehensive, professional explanation of the concept "${title}". 
Write 3-4 well-structured paragraphs detailing its definition, significance, key advancements, and real-world applications. 
LENGTH: Your response should be between 1200 and 1800 characters.
COMPLETION: It is CRITICAL that you reach a logical completion. Do NOT cut off mid-sentence. If you are approaching the limit, summarize concisely but ALWAYS end with a full stop and a finished thought.
SOURCES: At the end, list 2-3 specific, reputable sources (e.g., nature.com, arxiv.org, mit.edu). 
If a deep URL is not known, provide the domain and the publication name (e.g., "Nature: nature.com"). 
Format as "SOURCES:" on a new line followed by the list.`;
  }

  return callGeminiText(prompt, apiKey);
}

/**
 * Generates a synergy analysis when two research nodes are connected.
 * Returns sub-topics that sit at the intersection of both concepts.
 *
 * @param topicA - First concept title
 * @param topicB - Second concept title
 * @param apiKey - Gemini API key
 */
export async function fetchSynergyFromGemini(
  topicA: string,
  topicB: string,
  apiKey: string
): Promise<SubTopicDef[]> {
  const prompt = `You are a research knowledge graph assistant.
Given two research concepts, identify exactly 4 specific insights, findings, or sub-topics that emerge from the INTERSECTION of both concepts.
Each should represent a meaningful synergy — not just a combination of both, but a genuine insight that only exists when both are considered together.

For each provide:
- A short title (2-5 words)
- A one-sentence concept description (max 20 words)

Return ONLY a valid JSON array with no markdown, no explanation, no code fences:
[
  {"title": "Synergy Insight A", "concept": "How these two domains interact to produce this insight."},
  {"title": "Synergy Insight B", "concept": "A specific finding at the intersection of both concepts."}
]

Concept A: "${topicA}"
Concept B: "${topicB}"`;

  return callGemini<SubTopicDef[]>(prompt, apiKey);
}

/**
 * Calls Imagen 3 via Gemini API to generate a high-quality product image.
 * Returns a base64 Data URI that can be used directly in an <img src> tag.
 *
 * @param prompt - The image description
 * @param apiKey - Gemini API key
 */
export async function fetchImagenImage(
  prompt: string,
  apiKey: string
): Promise<string> {
  // Clean editorial product shot — light gray bg, soft shadows (matches user reference images)
  const premiumPrompt = `Clean product photography of a conceptual 3D object representing: "${prompt}".
    Style: Editorial magazine product shot, soft neutral light gray background (#f0f0f0), 
    centered hero object with subtle rounded corners, soft diffused studio lighting from above, 
    gentle contact shadow, matte and polished surface materials, minimal composition, 
    photorealistic render, 8K ultra-sharp, no text, no labels, no humans, no faces, no wireframes.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: premiumPrompt }],
        parameters: { 
          sampleCount: 1, 
          aspectRatio: '1:1',
          outputMimeType: 'image/jpeg'
        }
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ?? `Imagen API error: ${response.status}`
    );
  }

  const data = await response.json();
  // Check both possible response locations for base64
  const base64 = data?.predictions?.[0]?.bytesBase64Encoded || data?.predictions?.[0];
  
  if (!base64 || typeof base64 !== 'string') {
    console.error('Unexpected Imagen response structure:', data);
    throw new Error('No valid image data returned from Imagen 3');
  }
  
  return `data:image/jpeg;base64,${base64}`;
}
