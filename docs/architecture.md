# Offline-First Adaptive Memory Architecture

## 1. System Overview
The Persona-Aware RAG Assistant is designed as an **Offline-First** intelligence layer. All sensitive processing (Intent Classification, Sentiment Analysis, and Semantic Search) occurs locally on the client or the adjacent edge server.

## 2. Component Breakdown

### I. Data Tier (SQLite + FAISS)
* **SQLite**: Stores the structural data (Memory records, Persona history, Intent logs).
* **FAISS (In-Memory)**: A vector search index maintained in the application memory, using `all-MiniLM-L6-v2` for high-performance retrieval.
* **Encryption**: The local database is optionally encrypted at rest using `better-sqlite3` encryption features (SQLCipher).

### II. ML Tier (@xenova/transformers)
* **Intent Classifier**: A Centroid-based classifier using text embeddings.
* **Persona Engine**: A rules-based engine for sentiment, formality, and emotion extraction.
* **Conflict Resolver**: Logic that performs NLI (Natural Language Inference) checks between retrieved memory chunks.

### III. Sync Tier (Firebase Firestore)
* **One-Way Sync (Local to Cloud)**: Local memories are summarized, stripped of high-dimensional embeddings, and synced to Firestore.
* **Two-Way Sync (Configuration)**: User preferences and high-level persona states sync across devices.
* **Conflict Strategy**: "Recency-Wins" for configuration; "Cumulative-Merge" for memories.

## 3. Sync Workflow
1. User message is processed and stored in **Local SQLite**.
2. A background worker picks up the new record.
3. Record is **stripped of raw embeddings** (to save bandwidth and enhance privacy).
4. Record is pushed to **Firestore** under a user-specific subcollection.
5. On another device, the Firestore listener pulls the metadata and re-triggers local indexing if needed.

## 4. Security & Privacy
* **Local Inference**: Your raw thoughts never leave the device to reach a giant cloud LLM for "intent detection".
* **Firebase Auth**: All cloud data is protected by Identity-aware security rules.
* **Anonymization**: Synced data uses cryptographic UUIDs instead of PII.
