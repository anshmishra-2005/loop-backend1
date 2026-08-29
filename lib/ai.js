import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

// A very naive, lightweight TF-IDF style character-trigram embedder for the demo
// In a production app, use Voyage AI or OpenAI embeddings via their APIs
export const generateEmbedding = (text) => {
  const vector = new Array(300).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash << 5) - hash + trigram.charCodeAt(j);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % 300;
    vector[index] += 1;
  }
  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
};

export const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
};

export const classifyFeedback = async (feedbackContent, existingThemes = []) => {
  // If no API key is provided, mock the response to avoid crashing the demo
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'dummy_key') {
    return {
      sentiment: Math.random() > 0.5 ? 'POS' : 'NEG',
      sentimentScore: Math.random() * 2 - 1,
      themes: ['Mock Theme'],
      featureArea: 'Mock Area',
    };
  }

  const prompt = `
    Analyze the following customer feedback and extract the requested information.
    Return ONLY a valid JSON object matching this exact schema:
    {
      "sentiment": "POS" | "NEU" | "NEG",
      "sentimentScore": -1 to 1,
      "themes": ["array of theme names"],
      "featureArea": "short string"
    }

    Existing themes to consider reusing: [${existingThemes.join(', ')}]
    
    Feedback: "${feedbackContent}"
  `;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    const jsonText = message.content[0].text;
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Failed to parse JSON');
  } catch (error) {
    console.error('AI Classification Error:', error);
    return {
      sentiment: 'NEU',
      sentimentScore: 0,
      themes: [],
      featureArea: 'Unknown'
    };
  }
};

export const answerQuestion = async (question, contextFeedback) => {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'dummy_key') {
    return "This is a mocked answer because the Anthropic API key is not set. In a real environment, Claude would read the retrieved feedback and answer your question here.";
  }

  const contextText = contextFeedback.map((f, i) => `[${i + 1}] Feedback from ${f.channel}: "${f.content}"`).join('\n\n');

  const prompt = `
    You are an AI assistant helping a product manager analyze customer feedback.
    Answer the user's question STRICTLY using ONLY the provided feedback as context.
    Cite your sources using the [id] brackets provided. Do NOT invent or hallucinate information.
    If the answer cannot be found in the provided feedback, state clearly that the data does not contain the answer.

    Context:
    ${contextText}

    User Question:
    ${question}
  `;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });
    return message.content[0].text;
  } catch (error) {
    console.error('AI Generation Error:', error);
    return "Sorry, I encountered an error while generating the response.";
  }
};
