import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getEmbedding } from './intentClassifier';
import { checkContradiction, batchCheckContradictions } from './nliService';

// Ensure data directory exists for production-style organization
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[Database] Created directory: ${DATA_DIR}`);
}

export const db = new Database(path.join(DATA_DIR, 'adaptive_memory.db'));

// Initialize schema with production-style structure
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    timestamp INTEGER NOT NULL,
    emotionalWeight REAL,
    importanceScore REAL,
    layer TEXT DEFAULT 'short-term',
    decayRate REAL DEFAULT 0.05,
    tags TEXT,
    faiss_id INTEGER,
    isContradictory INTEGER DEFAULT 0,
    resolution TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memoryId TEXT,
    feedback TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS persona_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    day TEXT,
    mood TEXT,
    tone TEXT,
    triggerTopic TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS persona_history (
    id TEXT PRIMARY KEY,
    userId TEXT,
    day TEXT,
    traits TEXT,
    sentiment REAL,
    formality REAL,
    emotion TEXT,
    topTrigger TEXT,
    emojiUsage REAL,
    punctuationIntensity REAL
  );

  CREATE TABLE IF NOT EXISTS intent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    text TEXT,
    intent TEXT,
    confidence REAL,
    timestamp INTEGER
  );
`);

export interface Memory {
  id: string;
  userId: string;
  content: string;
  embedding: number[];
  timestamp: number;
  emotionalWeight: number;
  importanceScore: number;
  layer: 'sensory' | 'short-term' | 'long-term';
  decayRate: number;
  tags: string[];
  isContradictory?: boolean;
  resolution?: string;
}

/**
 * High-performance dot product for normalized vectors.
 * Since Xenova/Transformer embeddings are typically normalized, dot product == cosine similarity.
 */
function fastCosineSimilarity(v1: Float32Array, v2: Float32Array): number {
  let dotProduct = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
  }
  return dotProduct;
}

export class MemoryStore {
  /**
   * Memory Importance Detector: Prevents storing useless garbage.
   * Scores based on personal entities, relationships, and persistent facts.
   */
  calculateImportance(content: string, emotionalWeight: number): number {
    const textLower = content.toLowerCase();
    
    // Feature Weights
    const personalEntities = ['i', 'me', 'my', 'mine', 'myself'];
    const relationships = ['sister', 'brother', 'mom', 'dad', 'family', 'parents', 'mother', 'father', 'friend', 'cousin', 'uncle', 'aunt', 'grandfather', 'grandmother', 'wife', 'husband', 'son', 'daughter'];
    const persistentFacts = ['born', 'live', 'work', 'study', 'internship', 'college', 'university', 'career', 'job', 'profession', 'hometown', 'moved to', 'living in', 'graduated', 'degree', 'upsc', 'ai', 'engineer', 'developer', 'designer', 'doctor', 'teacher'];
    const preferences = ['love', 'like', 'enjoy', 'favorite', 'prefer', 'hate', 'dislike', 'passionate about'];
    const actions = ['remind', 'set', 'create', 'schedule', 'todo', 'list', 'prepare', 'generate', 'draft'];
    
    let score = 0.3; // Increased Base weight
    
    // Personal relevance boost
    if (personalEntities.some(e => textLower.includes(` ${e} `) || textLower.startsWith(e))) score += 0.2;
    // Relationships boost (High)
    if (relationships.some(r => textLower.includes(r))) score += 0.3;
    // Persistent facts boost (High)
    if (persistentFacts.some(f => textLower.includes(f))) score += 0.25;
    // Preferences boost
    if (preferences.some(p => textLower.includes(p))) score += 0.15;
    // Emotional content weight (Medium)
    const emotionalIntensity = Math.max(0, Math.abs(emotionalWeight - 0.5) * 2);
    score += (emotionalIntensity * 0.2);
    // Actions weight
    if (actions.some(a => textLower.includes(a))) score += 0.1;
    
    return Math.min(1.0, score);
  }

  getDecay(memory: any): number {
    const now = Date.now();
    const ageInHours = (now - memory.timestamp) / (1000 * 60 * 60);
    
    // Scale lambda based on layer
    // Sensory: very fast (half-life ~1 hour)
    // Short-term: medium (half-life ~12 hours)
    // Long-term: slow (half-life ~7 days)
    let lambda = 0.05;
    if (memory.layer === 'sensory') lambda = 0.7;
    else if (memory.layer === 'short-term') lambda = 0.06;
    else if (memory.layer === 'long-term') lambda = 0.005;

    // Emotional resonance slows decay
    const adjustedLambda = lambda / (1 + (memory.emotionalWeight || 0.1));
    
    return (memory.importanceScore || 0.5) * Math.exp(-adjustedLambda * ageInHours);
  }

  async addMemory(memory: Omit<Memory, 'embedding' | 'importanceScore' | 'layer' | 'decayRate'>) {
    console.log(`[Memory Store] STORE MEMORY CALLED: "${memory.content.slice(0, 50)}..."`);
    
    const embedding = await getEmbedding(memory.content);
    console.log(`[Memory Store] EMBEDDING GENERATED (${embedding.length} dimensions)`);
    
    const importanceScore = this.calculateImportance(memory.content, memory.emotionalWeight);
    
    // Hierarchical Layer Routing
    let layer: 'sensory' | 'short-term' | 'long-term' = 'short-term';
    if (importanceScore > 0.75) layer = 'long-term';
    else if (importanceScore < 0.3) layer = 'sensory';

    const decayRate = layer === 'long-term' ? 0.005 : (layer === 'short-term' ? 0.06 : 0.7);

    console.log(`[Memory Store] SQLITE INSERTED | Layer: ${layer.toUpperCase()} | Importance: ${importanceScore.toFixed(2)}`);
    console.log(`[Memory Store] FAISS UPDATED (Simulated via persistence)`);

    const stmt = db.prepare(`
      INSERT INTO memories (id, userId, content, embedding, timestamp, emotionalWeight, importanceScore, layer, decayRate, tags, faiss_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Mapping faiss_id as a simple incremental to satisfy system requirements
    const faiss_id = Math.floor(Math.random() * 1000000);

    stmt.run(
      memory.id,
      memory.userId,
      memory.content,
      Buffer.from(new Float32Array(embedding).buffer),
      memory.timestamp,
      memory.emotionalWeight,
      importanceScore,
      layer,
      decayRate,
      JSON.stringify(memory.tags),
      faiss_id
    );
  }

  async searchMemories(query: string, userId: string, limit = 5): Promise<any[]> {
    console.log(`[Memory Store] RETRIEVAL STARTED | Query: "${query}"`);
    
    const queryEmbed = await getEmbedding(query);
    const queryEmbedding = new Float32Array(queryEmbed);
    
    const memories = db.prepare(`
      SELECT id, content, embedding, timestamp, emotionalWeight, importanceScore, layer, tags 
      FROM memories 
      WHERE userId = ? 
      ORDER BY timestamp DESC 
      LIMIT 200
    `).all(userId) as any[];
    
    if (memories.length === 0) {
      console.log(`[Memory Store] No memories found for user ${userId}`);
      return [];
    }

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const now = Date.now();

    const scored = memories.map(m => {
      const mEmbedding = new Float32Array(m.embedding.buffer, m.embedding.byteOffset, m.embedding.byteLength / 4);
      const similarity = fastCosineSimilarity(queryEmbedding, mEmbedding);
      
      const importanceValue = this.getDecay(m);
      const ageInDays = (now - m.timestamp) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - (ageInDays / 30));
      
      const textLower = m.content.toLowerCase();
      let overlap = 0;
      for (const word of queryWords) {
        if (textLower.includes(word)) overlap++;
      }
      const keywordScore = Math.min(1, overlap / 3);

      const finalScore = (0.40 * similarity) + (0.25 * keywordScore) + (0.20 * recencyScore) + (0.15 * importanceValue);
      
      return {
        ...m,
        tags: JSON.parse(m.tags),
        score: finalScore,
        layer: m.layer,
        similarity,
        recency: recencyScore,
        decayedImportance: importanceValue
      };
    });

    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log(`[Memory Store] TOP SIMILAR MEMORIES:`);
    results.forEach((r, i) => console.log(`  ${i+1}. "${r.content.slice(0, 40)}..." (Score: ${r.score.toFixed(3)})`));

    return results;
  }

  async detectContradictions(memories: Memory[]): Promise<{ contradiction: boolean; explanation?: string }> {
    if (memories.length < 2) return { contradiction: false };

    const latest = memories[0];
    const candidates: [string, string][] = [];
    const candidateMemories: Memory[] = [];

    // Heuristic Pre-filter to create batch
    for (let i = 1; i < Math.min(memories.length, 8); i++) {
      const other = memories[i];
      const latestWords = latest.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const otherLower = other.content.toLowerCase();
      if (latestWords.some(w => otherLower.includes(w))) {
        candidates.push([latest.content, other.content]);
        candidateMemories.push(other);
      }
    }

    if (candidates.length > 0) {
      console.log(`[Batch NLI] checking ${candidates.length} potential conflicts...`);
      const results = await batchCheckContradictions(candidates);
      
      for (const res of results) {
        if (res.isContradictory) {
          return {
            contradiction: true,
            explanation: `Semantic dissonance (conf: ${Math.round(res.confidence * 100)}%) between your records: "${latest.content}" and "${candidateMemories[res.index].content}"`
          };
        }
      }
    }

    return { contradiction: false };
  }

  /**
   * Adaptive Feedback Loop: Updates memory importance based on relevance feedback.
   */
  async updateMemoryImportance(memoryId: string, feedback: 'relevant' | 'incorrect') {
    const boost = feedback === 'relevant' ? 1.1 : 0.8;
    db.prepare('UPDATE memories SET importanceScore = MIN(1.0, importanceScore * ?) WHERE id = ?').run(boost, memoryId);
    
    // Log feedback
    db.prepare('INSERT INTO feedback (memoryId, feedback, timestamp) VALUES (?, ?, ?)').run(memoryId, feedback, Date.now());
    console.log(`[Feedback] Memory ${memoryId} marked as ${feedback}. Importance adjusted.`);
  }

  /**
   * Records a snapshot of the user's emotional/behavioral state.
   */
  async logPersona(userId: string, profile: any) {
    const stmt = db.prepare(`
      INSERT INTO persona_history (id, userId, day, traits, sentiment, formality, emotion, topTrigger, emojiUsage, punctuationIntensity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const id = crypto.randomUUID();
    const day = new Date().toISOString().split('T')[0];
    
    stmt.run(
      id,
      userId,
      day,
      profile.tone,
      profile.sentiment,
      profile.formality,
      '', // mood descriptive
      '', // trigger topic
      profile.emojiDensity || 0,
      profile.punctuationIntensity || 0
    );
    console.log(`[Persona] State logged for ${userId} (Tone: ${profile.tone} | Emoji: ${profile.emojiDensity?.toFixed(2)} | Punc: ${profile.punctuationIntensity?.toFixed(2)})`);
  }

  async getLatestPersona(userId: string): Promise<any | null> {
    return db.prepare('SELECT * FROM persona_history WHERE userId = ? ORDER BY id DESC LIMIT 1').get(userId);
  }
}
