import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { classifyIntent, getExtractor, trainIntentClassifier, Intent } from "./src/lib/ml/intentClassifier";
import { PersonaEngine } from "./src/lib/ml/personaEngine";
import { MemoryStore, db } from "./src/lib/ml/memoryResolver";
import crypto from "crypto";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  generateUserId,
  normalizeUsername,
  validateUsername,
  validatePassword
} from "./src/lib/auth";

// Ensure models directory exists
if (!fs.existsSync('./models')) fs.mkdirSync('./models');

// Load Firebase Config — support both file-based (local) and env-var-based (Render/production)
let firebaseConfig: any = {};
let adminApp: admin.app.App | undefined;
let fbDb: any;

try {
  // Prefer env var (base64-encoded service account JSON) for production deployments
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8')
    );
    firebaseConfig = {
      projectId: serviceAccount.project_id,
      firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || '(default)'
    };
    if (admin.apps.length === 0) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    } else {
      adminApp = admin.apps[0]!;
    }
    fbDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    console.log(`[Firebase] Initialized via env var for project: ${firebaseConfig.projectId}`);
  } else if (fs.existsSync("./firebase-applet-config.json")) {
    firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
    if (admin.apps.length === 0) {
      adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId
      });
    } else {
      adminApp = admin.apps[0]!;
    }
    fbDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    console.log(`[Firebase] Initialized via config file for project: ${firebaseConfig.projectId} | DB: ${firebaseConfig.firestoreDatabaseId}`);
  } else {
    console.warn("[Firebase] No config found (file or env var). Sync features disabled.");
  }
} catch (error) {
  console.error("Firebase Admin initialization failed. Sync features will be disabled.", error);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DEMO_USERNAME = normalizeUsername('demo_user');
const DEMO_PASSWORD = 'demo_access_2026';

app.use(express.json());

// Enhanced Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }

  req.user = decoded;
  next();
};

const personaEngine = new PersonaEngine();
const memoryStore = new MemoryStore();

// Trigger Training if model is missing
async function ensureModels() {
  if (!fs.existsSync('./models/intent_model.json')) {
    console.log("Intent model missing. Training on large synthetic dataset...");
    try {
        await trainIntentClassifier();
    } catch (e) {
        console.error("Training failed", e);
    }
  }
}
ensureModels();

// Sync logic: periodically push new local memories to Firestore
async function syncToFirebase(userId: string) {
  if (!fbDb) {
    console.warn("Skipping sync: Firestore not initialized.");
    return;
  }
  try {
    const localMemories = await memoryStore.searchMemories("", userId, 100);
    if (localMemories.length === 0) return;

    console.log(`[Sync] Attempting to sync ${localMemories.length} memories for ${userId} to DB: ${firebaseConfig.firestoreDatabaseId}`);

    const userRef = fbDb.collection("users").doc(userId);
    
    // Batch write to Firestore
    const batch = fbDb.batch();
    for (const mem of localMemories) {
      const memRef = userRef.collection("memories").doc(mem.id);
      
      // Clean up memory object for Firestore
      const memData = { ...mem };
      delete (memData as any).embedding; // Explicitly remove embedding if batch.set is sensitive

      batch.set(memRef, {
        ...memData,
        syncedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
    console.log(`[Sync] Successfully synced ${localMemories.length} memories for ${userId}`);
  } catch (error: any) {
    console.error(`[Sync] Failed for ${userId}:`, error.message || error);
    if (error.code === 7 || (error.message && error.message.includes('PERMISSION_DENIED'))) {
      console.error("[Sync] Permission Denied. This usually means the service account lacks IAM roles for this project/database.");
    }
  }
}

// ========== AUTHENTICATION ROUTES ==========

/**
 * SIGNUP: Create a new user account
 */
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const normalizedUsername = normalizeUsername(username || "");

    // Validate inputs
    const usernameValidation = validateUsername(normalizedUsername);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    // Check if username already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(normalizedUsername);
    if (existingUser) {
      return res.status(409).json({ error: "Username already taken. Choose a different one." });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const userId = generateUserId();
    const createdAt = Date.now();

    db.prepare('INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
      .run(userId, normalizedUsername, passwordHash, createdAt);

    const user = { id: userId, username: normalizedUsername };
    const token = generateToken(user);

    console.log(`[Auth] New user registered: ${normalizedUsername}`);
    res.status(201).json({
      message: "Account created successfully",
      token,
      user
    });
  } catch (error: any) {
    console.error(`[Auth Signup Error]`, error);
    res.status(500).json({ error: error.message || "Signup failed" });
  }
});

/**
 * SIGNIN: Login with existing credentials
 */
app.post("/api/auth/signin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const normalizedUsername = normalizeUsername(username || "");

    // Validate inputs
    if (!normalizedUsername || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(normalizedUsername) as any;
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Verify password
    const passwordMatch = await verifyPassword(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Generate token
    const authUser = { id: user.id, username: user.username };
    const token = generateToken(authUser);

    console.log(`[Auth] User signed in: ${normalizedUsername}`);
    res.json({
      message: "Login successful",
      token,
      user: authUser
    });
  } catch (error: any) {
    console.error(`[Auth Signin Error]`, error);
    res.status(500).json({ error: error.message || "Signin failed" });
  }
});

/**
 * LOGOUT: Invalidate session (optional - mainly for UI)
 */
app.post("/api/auth/logout", authenticateToken, (req: any, res) => {
  console.log(`[Auth] User logged out: ${req.user.username}`);
  res.json({ message: "Logged out successfully" });
});

/**
 * BOOTSTRAP: Create or load a built-in demo session so the app can open without an auth page.
 */
app.post("/api/auth/bootstrap", async (_req, res) => {
  try {
    let user = db.prepare('SELECT id, username, passwordHash FROM users WHERE LOWER(username) = ?').get(DEMO_USERNAME) as any;

    if (!user) {
      const userId = generateUserId();
      const passwordHash = await hashPassword(DEMO_PASSWORD);

      db.prepare('INSERT OR IGNORE INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
        .run(userId, DEMO_USERNAME, passwordHash, Date.now());

      user = db.prepare('SELECT id, username, passwordHash FROM users WHERE LOWER(username) = ?').get(DEMO_USERNAME) as any;

      if (!user) {
        throw new Error('Demo user could not be created or loaded');
      }

      if (user.id === userId) {
        console.log(`[Auth] Demo session created: ${DEMO_USERNAME}`);
      } else {
        console.log(`[Auth] Demo session loaded: ${DEMO_USERNAME}`);
      }
    }

    const token = generateToken({ id: user.id, username: user.username });

    res.json({
      message: 'Demo session ready',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error: any) {
    console.error('[Auth Bootstrap Error]', error);
    res.status(500).json({ error: error.message || 'Failed to bootstrap demo session' });
  }
});

/**
 * Main Central Orchestrator for the Cognitive Assistant.
 * Fulfills CASE 1 (Ingestion) and CASE 2 (Retrieval) flows.
 */
async function processCognitiveMessage(text: string, userId: string): Promise<any> {
    console.log(`\n[Orchestrator] --- NEW MESSAGE RECEIVED ---`);
    console.log(`[Orchestrator] Input: "${text}" | User: ${userId}`);

    // 1. Intent Detection
    console.log(`[Orchestrator] Step 1: Running Intent Classifier...`);
    const intentResult = await classifyIntent(text);
    console.log(`[Orchestrator] Intent: ${intentResult.intent} (conf: ${intentResult.confidence.toFixed(2)})`);

    // Log Intent to SQLite for Traceability
    db.prepare(`
      INSERT INTO intent_logs (userId, text, intent, confidence, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, text, intentResult.intent, intentResult.confidence, Date.now());

    // 2. Persona Tracking
    console.log(`[Orchestrator] Step 2: Running Persona Engine...`);
    const personaState = await personaEngine.analyzeMessage(text);
    const traits = personaEngine.summarizePersona(personaState);
    await memoryStore.logPersona(userId, personaState);
    console.log(`[Orchestrator] Tone: ${personaState.tone} | Traits: ${traits.join(', ')}`);

    // 3. Retrieval & Reasoning
    console.log(`[Orchestrator] Step 3: Semantic Retrieval Started...`);
    const retrievedMemories = await memoryStore.searchMemories(text, userId);
    console.log(`[Orchestrator] Found ${retrievedMemories.length} relevant context(s) in Vault.`);

    console.log(`[Orchestrator] Step 4: Logic Routing...`);
    let adaptiveResponse = "";
    let contradictionResult = { contradiction: false };

    // --- CASE 2: MEMORY QUERY ---
    if (intentResult.intent === Intent.MEMORY_QUERY || text.toLowerCase().includes('did i mention') || text.toLowerCase().includes('do you remember')) {
      console.log(`[Orchestrator] Flow: CASE 2 (Memory Retrieval)`);
      
      if (retrievedMemories.length > 0) {
        // High-level Contradiction Check
        contradictionResult = await memoryStore.detectContradictions(retrievedMemories);
        
        let baseResp = `I recall some context. The most relevant record is: "${retrievedMemories[0].content}".`;
        
        if (retrievedMemories.length > 1) {
          baseResp += ` I also found ${retrievedMemories.length - 1} other related points in my cognitive history.`;
        }

        if (contradictionResult.contradiction) {
          console.log(`[Orchestrator] Reasoning: CONTRADICTION DETECTED!`);
          baseResp += ` CRITICAL: I detect semantic dissonance in your history. ${ (contradictionResult as any).explanation }`;
        }
        
        adaptiveResponse = personaEngine.getAdaptiveResponse(baseResp, personaState);
      } else {
        adaptiveResponse = personaEngine.getAdaptiveResponse("My semantic search of your vault returned no high-confidence overlaps for that query.", personaState);
      }
    } 
    // --- CASE 1: MEMORY STORAGE ---
    else if (intentResult.intent === Intent.MEMORY_STORE || 
             intentResult.intent === Intent.PREFERENCE || 
             intentResult.intent === Intent.PERSONAL_PROFILE || 
             (text.length >= 10 && intentResult.intent !== Intent.SMALL_TALK && intentResult.intent !== Intent.GREETING)) {
      console.log(`[Orchestrator] Flow: CASE 1 (Memory Ingestion)`);
      
      const sentimentShift = (personaState.sentiment! + 1) / 2;
      const importanceScore = memoryStore.calculateImportance(text, sentimentShift);
      
      if (importanceScore >= 0.4 || intentResult.intent === Intent.PREFERENCE || intentResult.intent === Intent.PERSONAL_PROFILE) {
        console.log(`[Orchestrator] Importance: ${importanceScore.toFixed(2)} (High/Semantic). Storing Memory...`);
        const memoryId = crypto.randomUUID();
        await memoryStore.addMemory({
          id: memoryId,
          userId,
          content: text,
          timestamp: Date.now(),
          emotionalWeight: sentimentShift,
          tags: [intentResult.intent, ...traits]
        });
        
        syncToFirebase(userId);

        if (intentResult.intent === Intent.PREFERENCE) {
            adaptiveResponse = personaEngine.getAdaptiveResponse("Your preference has been registered and indexed for semantic alignment.", personaState);
        } else {
            adaptiveResponse = personaEngine.getAdaptiveResponse("Memory committed to my long-term vault for future retrieval.", personaState);
        }
      } else {
        console.log(`[Orchestrator] Importance: ${importanceScore.toFixed(2)} (Low). Sensory only.`);
        adaptiveResponse = personaEngine.getAdaptiveResponse("Noted. This feels like lower-importance sensory data.", personaState);
      }
    } 
    else if (intentResult.intent === Intent.GREETING) {
        console.log(`[Orchestrator] Flow: SOCIAL (Greeting)`);
        adaptiveResponse = personaEngine.getAdaptiveResponse("Hello! My neural processors are active and ready. How can I assist your vault today?", personaState);
    }
    else {
      console.log(`[Orchestrator] Flow: DEFAULT (Social Interaction)`);
      adaptiveResponse = personaEngine.getAdaptiveResponse("Message acknowledged. My neural state has been updated.", personaState);
    }

    // 5. Final Response Generation
    console.log(`[Orchestrator] Step 5: Final Response Generation...`);
    console.log(`[Orchestrator] FINAL RESPONSE: "${adaptiveResponse.slice(0, 40)}..."`);
    console.log(`[Orchestrator] --- PROCESSING COMPLETE ---\n`);

    return {
      intent: intentResult,
      persona: {
        state: personaState,
        traits
      },
      memories: retrievedMemories,
      contradiction: contradictionResult,
      adaptiveResponse
    };
}

app.post("/api/process", authenticateToken, async (req: any, res) => {
  try {
    const { text } = req.body;
    const userId = req.user.id;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const result = await processCognitiveMessage(text, userId);
    res.json(result);
  } catch (error) {
    console.error(`[Orchestrator Error]`, error);
    res.status(500).json({ error: "Internal processing error" });
  }
});

app.get("/api/memories", authenticateToken, async (req: any, res) => {
  const { query } = req.query;
  const userId = req.user.id;
  
  const memories = await memoryStore.searchMemories(query as string || "", userId as string, 20);
  res.json(memories);
});

app.post("/api/memories/feedback", authenticateToken, async (req, res) => {
  const { memoryId, feedback } = req.body;
  if (!memoryId || !feedback) return res.status(400).json({ error: "Missing fields" });
  
  await memoryStore.updateMemoryImportance(memoryId, feedback);
  res.json({ status: "ok" });
});

app.get("/api/persona/seed", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  // In a real system, we'd query the persona_history table
  const history = [
    { day: "2026-05-10", traits: ["curious", "formal"], trigger: "starting project", sentiment: 0.5, formality: 0.8 },
    { day: "2026-05-11", traits: ["curious", "formal"], trigger: "learning APIs", sentiment: 0.4, formality: 0.75 },
    { day: "2026-05-12", traits: ["optimistic", "casual"], trigger: "first success", sentiment: 0.8, formality: 0.4 },
    { day: "2026-05-13", traits: ["distressed", "formal"], trigger: "bug in code", sentiment: -0.6, formality: 0.85 },
    { day: "2026-05-14", traits: ["frustrated", "casual"], trigger: "missing deadline", sentiment: -0.8, formality: 0.3 },
    { day: "2026-05-15", traits: ["playful", "casual"], trigger: "project finish", sentiment: 0.9, formality: 0.2 },
  ];
  res.json(history);
});

app.get("/api/insights", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;
  const memories = await memoryStore.searchMemories("", userId, 50);
  
  // Dynamic insights
  const highEmotionMemories = memories.filter(m => m.emotionalWeight > 0.7);
  const commonTags = memories.flatMap(m => m.tags).reduce((acc: any, t: string) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  
  const sortedTags = Object.entries(commonTags).sort((a: any, b: any) => b[1] - a[1]);
  
  const insights = [
    { 
      label: 'Cognitive Density', 
      text: `Your mental focus is currently split across ${Object.keys(commonTags).length} unique semantic domains.`,
      type: 'density'
    },
    {
      label: 'Emotional Anchor',
      text: highEmotionMemories.length > 0 
        ? `Recurrent intensity detected around topics: ${highEmotionMemories.slice(0, 2).map(m => m.tags[0]).join(', ')}.`
        : 'Steady emotional profile detected across recent sessions.',
      type: 'emotion'
    },
    {
      label: 'RAG Efficiency',
      text: `Semantic retrieval is optimizing around "${sortedTags[0]?.[0] || 'general'}" topics.`,
      type: 'rag'
    }
  ];

  res.json({ insights });
});

app.get("/api/persona/drift", authenticateToken, async (req: any, res) => {
    const userId = req.user.id;

    const latest = await memoryStore.getLatestPersona(userId);
    if (!latest) return res.json({ drift: 0, status: "stable" });

    // For demo purposes, we'll compare the latest to a fixed "initial" state or 7 days ago
    // In production, we'd average the last 3 logs
    const baseline = { sentiment: 0.2, formality: 0.6, emojiDensity: 0.1, punctuationIntensity: 0.2 }; // Default baseline
    
    const drift = personaEngine.calculateDrift(latest, baseline as any);
    
    res.json({
        drift,
        status: drift > 0.4 ? "significant drift" : drift > 0.2 ? "drifting" : "stable",
        current: latest,
        baseline
    });
});

app.get("/api/admin/db-stats", authenticateToken, async (req, res) => {
  try {
    const memoriesCount = db.prepare('SELECT COUNT(*) as count FROM memories').get() as any;
    const personaCount = db.prepare('SELECT COUNT(*) as count FROM persona_history').get() as any;
    const feedbackCount = db.prepare('SELECT COUNT(*) as count FROM feedback').get() as any;
    const intentCount = db.prepare('SELECT COUNT(*) as count FROM intent_logs').get() as any;
    const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;

    res.json({
      memories: memoriesCount.count,
      persona: personaCount.count,
      feedback: feedbackCount.count,
      intent: intentCount.count,
      users: usersCount.count,
      dbPath: 'adaptive_memory.db'
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch DB stats" });
  }
});

app.post("/api/admin/db-cleanup", authenticateToken, async (req, res) => {
  try {
    // Delete sensory memories older than 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const result = db.prepare('DELETE FROM memories WHERE layer = ? AND timestamp < ?').run('sensory', oneDayAgo);
    res.json({ deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: "Cleanup failed" });
  }
});

app.get("/api/memories/seed", authenticateToken, async (req: any, res) => {
  const userId = req.user.id;

  const { TRAINING_DATA } = await import("./src/lib/ml/intentClassifier");
  
  console.log(`[Seed] Ingesting ${TRAINING_DATA.length} initial memories for ${userId}...`);
  
  for (const item of TRAINING_DATA) {
    if (item.label === Intent.MEMORY_STORE) {
      await memoryStore.addMemory({
        id: crypto.randomUUID(),
        userId: userId as string,
        content: item.text,
        timestamp: Date.now() - (Math.random() * 10 * 24 * 60 * 60 * 1000), // Random last 10 days
        emotionalWeight: 0.5,
        tags: ['seed', item.label]
      });
    }
  }

  res.json({ status: "ok", count: TRAINING_DATA.filter(d => d.label === Intent.MEMORY_STORE).length });
});

app.get("/api/test-pipeline", async (req, res) => {
  const userId = "test-user-" + Date.now();
  const results = [];

  try {
    // Create a temporary user so foreign key constraints are satisfied
    const testPasswordHash = await hashPassword("test-pipeline-password");
    db.prepare('INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
      .run(userId, `test_${Date.now()}`, testPasswordHash, Date.now());

    // 1. Storage Test
    console.log("[Test] Running Case 1: Storage...");
    const msg1 = "My sister studies in Hyderabad";
    const resp1 = await processCognitiveMessage(msg1, userId);
    results.push({ case: "storage_1", input: msg1, intent: resp1.intent.intent, stored: true });

    // 2. Storage Test 2
    console.log("[Test] Running Case 2: Storage (Potential Conflict)...");
    const msg2 = "My sister moved to Delhi";
    const resp2 = await processCognitiveMessage(msg2, userId);
    results.push({ case: "storage_2", input: msg2, intent: resp2.intent.intent, stored: true });

    // 3. Retrieval & Contradiction Test
    console.log("[Test] Running Case 3: Retrieval & Contradiction...");
    const msg3 = "Did I mention my sister?";
    const resp3 = await processCognitiveMessage(msg3, userId);
    results.push({ 
        case: "retrieval_contradiction", 
        input: msg3, 
        found: resp3.memories.length > 0, 
        contradiction: resp3.contradiction?.contradiction,
        response: resp3.adaptiveResponse
    });

    res.json({ status: "success", summary: results });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

async function startServer() {
  // Only train if the model file doesn't already exist (avoids slow re-training on every cold start)
  if (!fs.existsSync('./models/intent_model.json')) {
    console.log("[Startup] Intent model not found — training now...");
    try {
      await trainIntentClassifier();
    } catch (e) {
      console.error("[Startup] Training failed:", e);
    }
  } else {
    console.log("[Startup] Intent model found — skipping training.");
  }

  // Register health + favicon BEFORE the SPA wildcard so they are reachable in production
  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback — must be last
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
