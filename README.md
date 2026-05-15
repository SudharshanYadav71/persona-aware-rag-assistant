# PERSONA-AWARE RAG ASSISTANT
## Adaptive Cognitive Memory System (Fully Offline)

This is a premium, locally-hosted AI assistant that understands memory, emotion, and context evolution. It employs a hierarchical memory architecture and persona-drift detection to provide a human-like cognitive experience.

### 🧠 Core Features
- **Adaptive Persona Engine**: Detects emotional drift and behavioral transitions over time.
- **Hierarchical Memory**: Implements Sensory, Short-term, and Long-term memory layers with exponential decay ($M(t) = M_0 \cdot e^{-\lambda t}$).
- **Conflict-Aware RAG**: Resolves contradictory memories by ranking them based on recency, importance, and emotional weight.
- **Neural Memory Graph**: Visualizes cognitive relationships between nodes, people, and topics.
- **Offline Intelligence**: Uses local-first embeddings and classification (FAISS-like SQLite + transformers.js).
- **Cinematic UI**: Futuristic dashboard with glassmorphism, glowing neons, and fluid motion.

### 🛠️ Tech Stack
- **Frontend**: React 18, TailwindCSS, Framer Motion, Recharts, Lucide Icons.
- **Backend**: Express (Node.js), SQLite (Local Memory Bank), better-sqlite3.
- **AI/ML**: @xenova/transformers (sentence-embeddings), Logistic Regression (Local Intent Classifier).
- **Storage**: Firebase (Optional Metadata Sync), SQLite (Primary Local Vault).

### 🚀 Setup Instructions
1. **Model Training**: The system automatically trains a local intent classifier on first boot using a synthetic balanced dataset of 1000+ samples.
2. **Local Environment**:
   ```bash
   npm install
   npm run build
   npm run start
   ```
3. **Hardware**: Runs entirely on CPU. Optimized for low RAM usage (~200MB for embeddings).

### 📐 Architecture
- **Layer 1: Perception**: Intent classifier & Emotional extraction.
- **Layer 2: Memory Storage**: Hierarchical routing based on importance scores.
- **Layer 3: Cognitive Analysis**: Drift detection and contradiction resolution.
- **Layer 4: Presentation**: Neural desktop and emotional pulse pulse analytics.

---
*Built for privacy-first, emotionally intelligent human-AI interaction.*
