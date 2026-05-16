import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';

// Set cache directory to avoid permission issues
env.allowLocalModels = false;
env.cacheDir = './.cache';
if (!fs.existsSync('./.cache')) fs.mkdirSync('./.cache');

export enum Intent {
  REMINDER = 'reminder',
  EMOTIONAL_SUPPORT = 'emotional-support',
  ACTION_ITEM = 'action-item',
  SMALL_TALK = 'small-talk',
  MEMORY_QUERY = 'memory-query',
  MEMORY_STORE = 'memory-store',
  GREETING = 'greeting',
  PREFERENCE = 'preference',
  PERSONAL_PROFILE = 'personal-profile',
  UNKNOWN = 'unknown'
}

let extractor: any = null;
let intentModel: any = null;
let embeddingModelReady = false;
let embeddingModelPromise: Promise<void> | null = null;

// Load embedding model in background — never block requests
embeddingModelPromise = (async () => {
  try {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    embeddingModelReady = true;
    console.log('[IntentClassifier] Embedding model loaded.');
  } catch (e) {
    console.warn('[IntentClassifier] Embedding model unavailable:', (e as any)?.message);
  }
})();

export async function waitForEmbeddingModel() {
  if (embeddingModelPromise) {
    await embeddingModelPromise;
  }
}

export async function getExtractor() {
  return extractor;
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingModelReady || !extractor) {
    // Return zero vector as fallback when model not ready
    return new Array(384).fill(0);
  }
  try {
    const model = extractor;
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (e) {
    console.warn('[IntentClassifier] Embedding failed:', (e as any)?.message);
    return new Array(384).fill(0);
  }
}

function cosineSimilarity(v1: number[], v2: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    mA += v1[i] * v1[i];
    mB += v2[i] * v2[i];
  }
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

function preprocessText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')    // normalize whitespace
    .trim();
}

export async function classifyIntent(text: string): Promise<{ intent: Intent; confidence: number }> {
  console.log(`[Classifier] ROUTER CALLED for text: "${text.slice(0, 30)}..."`);
  const cleanText = preprocessText(text);
  
  // 1. Hybrid Router: Rule-based routing for high-confidence patterns
  const queryKeywords = ['remember', 'mention', 'recall', 'what did i say', 'do you know about', 'talked about', 'yesterday', 'earlier'];
  const storeKeywords = ['my sister', 'my brother', 'my father', 'my mother', 'i study', 'i work', 'i live', 'i am from', 'born in'];
  const prefKeywords = ['i love', 'i like', 'my favorite'];
  const greetingKeywords = ['hello', 'hey', 'hi', 'good morning', 'good evening', 'good night'];

  if (queryKeywords.some(k => cleanText.includes(k))) {
    return { intent: Intent.MEMORY_QUERY, confidence: 0.98 };
  }

  if (storeKeywords.some(k => cleanText.includes(k))) {
    return { intent: Intent.MEMORY_STORE, confidence: 0.96 };
  }

  if (prefKeywords.some(k => cleanText.includes(k))) {
    return { intent: Intent.PREFERENCE, confidence: 0.94 };
  }

  if (greetingKeywords.some(k => cleanText.startsWith(k))) {
    return { intent: Intent.GREETING, confidence: 0.99 };
  }

  // If embedding model not ready, fall back to unknown — rule-based handles common cases
  if (!embeddingModelReady || !extractor) {
    console.warn('[Classifier] Embedding model not ready, returning UNKNOWN for centroid match');
    return { intent: Intent.UNKNOWN, confidence: 0.1 };
  }

  // Load saved model if not loaded
  if (!intentModel) {
    try {
      if (fs.existsSync('./models/intent_model.json')) {
        intentModel = JSON.parse(fs.readFileSync('./models/intent_model.json', 'utf-8'));
      }
    } catch (e) {
      console.error("Failed to load intent model", e);
    }
  }

  try {
    const embedding = await getEmbedding(cleanText);
    
    let bestIntent = Intent.UNKNOWN;
    let maxScore = -1;

    // Use centroids if available
    if (intentModel && intentModel.centroids) {
      for (const [label, centroid] of Object.entries(intentModel.centroids)) {
        const score = cosineSimilarity(embedding, centroid as number[]);
        if (score > maxScore) {
          maxScore = score;
          bestIntent = label as Intent;
        }
      }
    }

    // Final confidence mapping (logistic-like)
    const confidence = 1 / (1 + Math.exp(-10 * (maxScore - 0.45)));

    console.log(`[Classifier] Query: "${text}" | Winner: ${bestIntent} | Raw Score: ${maxScore.toFixed(3)} | Confidence: ${(confidence * 100).toFixed(1)}%`);

    if (maxScore < 0.25) {
      return { intent: Intent.UNKNOWN, confidence: confidence };
    }

    return { intent: bestIntent, confidence: confidence };
  } catch (e) {
    console.error('[Classifier] Classification error:', e);
    return { intent: Intent.UNKNOWN, confidence: 0 };
  }
}

/**
 * Training dataset provided for intent classification.
 */
export const TRAINING_DATA = [
  { text: "My sister works in Bangalore", label: Intent.MEMORY_STORE },
  { text: "My brother is preparing for UPSC", label: Intent.MEMORY_STORE },
  { text: "I study artificial intelligence", label: Intent.MEMORY_STORE },
  { text: "I work as a freelance designer", label: Intent.MEMORY_STORE },
  { text: "I recently moved to Hyderabad", label: Intent.MEMORY_STORE },
  { text: "My mother is a teacher", label: Intent.MEMORY_STORE },
  { text: "My father owns a medical shop", label: Intent.MEMORY_STORE },
  { text: "I enjoy playing cricket on weekends", label: Intent.PREFERENCE },
  { text: "I love listening to lo-fi music", label: Intent.PREFERENCE },
  { text: "My favorite programming language is Python", label: Intent.PREFERENCE },
  { text: "I like watching sci-fi movies", label: Intent.PREFERENCE },
  { text: "I prefer working at night", label: Intent.PREFERENCE },
  { text: "I enjoy solving coding problems", label: Intent.PREFERENCE },
  { text: "Did I mention my sister earlier?", label: Intent.MEMORY_QUERY },
  { text: "What do you remember about my studies?", label: Intent.MEMORY_QUERY },
  { text: "Do you know where I work?", label: Intent.MEMORY_QUERY },
  { text: "Did I tell you about my hometown?", label: Intent.MEMORY_QUERY },
  { text: "What did I say about my internship?", label: Intent.MEMORY_QUERY },
  { text: "Remind me to complete the assignment tomorrow", label: Intent.REMINDER },
  { text: "Set a reminder for my gym session", label: Intent.REMINDER },
  { text: "Remind me about the interview next week", label: Intent.REMINDER },
  { text: "Don't let me forget the meeting tomorrow", label: Intent.REMINDER },
  { text: "I feel stressed because of deadlines", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I feel lonely while studying", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I'm very excited about my new project", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I feel anxious before interviews", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I'm frustrated because the API keeps failing", label: Intent.EMOTIONAL_SUPPORT },
  { text: "Sometimes I feel unmotivated", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I feel burned out from continuous work", label: Intent.EMOTIONAL_SUPPORT },
  { text: "Generate a weekly study plan", label: Intent.ACTION_ITEM },
  { text: "Create a report for today's meeting", label: Intent.ACTION_ITEM },
  { text: "Prepare interview questions for me", label: Intent.ACTION_ITEM },
  { text: "Generate notes from this lecture", label: Intent.ACTION_ITEM },
  { text: "Create a roadmap for learning AI", label: Intent.ACTION_ITEM },
  { text: "Hello", label: Intent.GREETING },
  { text: "Good morning", label: Intent.GREETING },
  { text: "Hey there", label: Intent.GREETING },
  { text: "Hi assistant", label: Intent.GREETING },
  { text: "What's up?", label: Intent.SMALL_TALK },
  { text: "How are you doing today?", label: Intent.SMALL_TALK },
  { text: "Nice weather today", label: Intent.SMALL_TALK },
  { text: "Yo bro", label: Intent.SMALL_TALK },
  { text: "My cousin lives in Chennai", label: Intent.MEMORY_STORE },
  { text: "My best friend studies medicine", label: Intent.MEMORY_STORE },
  { text: "I currently live in Kadapa", label: Intent.MEMORY_STORE },
  { text: "I am learning React and FastAPI", label: Intent.MEMORY_STORE },
  { text: "I want to become an ML engineer", label: Intent.MEMORY_STORE },
  { text: "My uncle owns a business in Mumbai", label: Intent.MEMORY_STORE },
  { text: "I enjoy building AI applications", label: Intent.PREFERENCE },
  { text: "I like dark mode interfaces", label: Intent.PREFERENCE },
  { text: "My favorite sport is football", label: Intent.PREFERENCE },
  { text: "Did I mention my favorite sport?", label: Intent.MEMORY_QUERY },
  { text: "What do you know about my family?", label: Intent.MEMORY_QUERY },
  { text: "Do you remember my career goal?", label: Intent.MEMORY_QUERY },
  { text: "What did I say about Hyderabad?", label: Intent.MEMORY_QUERY },
  { text: "Remind me to revise DSA tonight", label: Intent.REMINDER },
  { text: "Set a reminder to call my parents", label: Intent.REMINDER },
  { text: "Don't let me forget the webinar tomorrow", label: Intent.REMINDER },
  { text: "I feel happy after completing my project", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I feel emotionally drained today", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I'm nervous about the presentation", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I feel optimistic about my future", label: Intent.EMOTIONAL_SUPPORT },
  { text: "Create documentation for my project", label: Intent.ACTION_ITEM },
  { text: "Generate a to-do list for tomorrow", label: Intent.ACTION_ITEM },
  { text: "Prepare a summary of this article", label: Intent.ACTION_ITEM },
  { text: "Hello my friend", label: Intent.GREETING },
  { text: "Good evening", label: Intent.GREETING },
  { text: "Hey buddy", label: Intent.SMALL_TALK },
  { text: "How's your day going?", label: Intent.SMALL_TALK },
  { text: "My sister moved to Delhi last year", label: Intent.MEMORY_STORE },
  { text: "My brother now lives in Bangalore", label: Intent.MEMORY_STORE },
  { text: "I work remotely for a startup", label: Intent.MEMORY_STORE },
  { text: "I study at an engineering college", label: Intent.MEMORY_STORE },
  { text: "I enjoy reading psychology books", label: Intent.PREFERENCE },
  { text: "I love exploring new technologies", label: Intent.PREFERENCE },
  { text: "Did I tell you where my sister works?", label: Intent.MEMORY_QUERY },
  { text: "Do you remember my favorite programming language?", label: Intent.MEMORY_QUERY },
  { text: "Remind me to submit the internship task", label: Intent.REMINDER },
  { text: "Set a reminder for tomorrow's class", label: Intent.REMINDER },
  { text: "I feel confused about my future", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I'm excited for the hackathon next month", label: Intent.EMOTIONAL_SUPPORT },
  { text: "Prepare slides for the presentation", label: Intent.ACTION_ITEM },
  { text: "Create interview preparation notes", label: Intent.ACTION_ITEM },
  { text: "Hi there", label: Intent.GREETING },
  { text: "Yo what's happening?", label: Intent.SMALL_TALK },
  { text: "My father recently shifted to Chennai", label: Intent.MEMORY_STORE },
  { text: "My mother likes gardening", label: Intent.MEMORY_STORE },
  { text: "I love biryani and pizza", label: Intent.PREFERENCE },
  { text: "My favorite editor is VS Code", label: Intent.PREFERENCE },
  { text: "Did I mention where I was born?", label: Intent.MEMORY_QUERY },
  { text: "What do you remember about my project?", label: Intent.MEMORY_QUERY },
  { text: "Remind me to practice aptitude questions", label: Intent.REMINDER },
  { text: "Don't let me miss the train tomorrow", label: Intent.REMINDER },
  { text: "I feel disappointed with my performance", label: Intent.EMOTIONAL_SUPPORT },
  { text: "I'm frustrated with debugging errors", label: Intent.EMOTIONAL_SUPPORT },
  { text: "Generate project milestones for this month", label: Intent.ACTION_ITEM },
  { text: "Prepare my weekend study schedule", label: Intent.ACTION_ITEM },
  { text: "Good night", label: Intent.GREETING },
  { text: "Hey how's it going?", label: Intent.SMALL_TALK }
];

export async function trainIntentClassifier() {
  console.log(`[Training] Embedding ${TRAINING_DATA.length} balanced samples...`);
  const dataset: { text: string; label: Intent }[] = [...TRAINING_DATA];

  // Also include synthetic variations to bolster training
  const tasks = ["study", "exercise", "buy groceries", "call mom", "fix the bug", "write code", "gym session", "dentist appointment", "practice aptitude", "prepare UPSC", "prepare interview"];
  const emotions = ["stressed", "happy", "anxious", "sad", "frustrated", "elated", "tired", "inspired", "lonely", "burned out", "motivated", "unmotivated"];
  const subjects = ["sister", "brother", "exams", "college", "project", "hyderabad", "family", "internship", "parents", "job", "career", "goal", "favorite sport", "favorite editor", "study schedule"];

  const templates = {
    [Intent.REMINDER]: ["remind me to {task}", "set a reminder for {task}", "dont forget to {task}", "remind me about {task}"],
    [Intent.ACTION_ITEM]: ["i need to {task}", "must complete {task}", "add {task} to my to-do list", "generate {task}", "create {task}", "prepare {task}"],
    [Intent.EMOTIONAL_SUPPORT]: ["i feel {emotion}", "im so {emotion}", "today has been {emotion}", "i am feeling {emotion} because of {subject}"],
    [Intent.MEMORY_QUERY]: ["did i mention {subject}", "do you remember {subject}", "what did i say about {subject}", "do you know about my {subject}"],
    [Intent.MEMORY_STORE]: ["my {subject} is in {location}", "i like {subject}", "i am learning {subject}", "i work as a {subject}", "i live in {location}", "recently moved to {location}"]
  };

  const locations = ["Delhi", "Bangalore", "Hyderabad", "Chennai", "Mumbai", "Kadapa", "Pune", "Kolkata"];

  for (let i = 0; i < 50; i++) {
    for (const [intent, tList] of Object.entries(templates)) {
      let text = tList[Math.floor(Math.random() * tList.length)];
      text = text.replace('{task}', tasks[Math.floor(Math.random() * tasks.length)])
                 .replace('{emotion}', emotions[Math.floor(Math.random() * emotions.length)])
                 .replace('{subject}', subjects[Math.floor(Math.random() * subjects.length)])
                 .replace('{location}', locations[Math.floor(Math.random() * locations.length)]);
      dataset.push({ text, label: intent as Intent });
    }
  }

  const centroids: Record<string, number[]> = {};
  const counts: Record<string, number> = {};

  for (const item of dataset) {
    const emb = await getEmbedding(preprocessText(item.text));
    if (!centroids[item.label]) {
      centroids[item.label] = new Array(emb.length).fill(0);
      counts[item.label] = 0;
    }
    for (let j = 0; j < emb.length; j++) {
      centroids[item.label][j] += emb[j];
    }
    counts[item.label]++;
  }

  for (const label in centroids) {
    for (let j = 0; j < centroids[label].length; j++) {
      centroids[label][j] /= counts[label];
    }
  }

  intentModel = { centroids, version: '2.0.0', samples: dataset.length };
  if (!fs.existsSync('./models')) fs.mkdirSync('./models');
  fs.writeFileSync('./models/intent_model.json', JSON.stringify(intentModel));
  console.log("Training complete with balanced dataset.");
}
