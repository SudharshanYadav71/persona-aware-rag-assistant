# Technical Architecture Document
## Persona-Aware RAG Assistant

### 1. Data Flow Architecture
1. **Input**: User message enters via the React frontend.
2. **Analysis**:
   - **Intent Classifier**: Maps text to `[reminder, action-item, emotion-support, small-talk]`.
   - **Persona Engine**: Extract sentiment and formality; updates the current persona vector.
3. **Retrieval**:
   - Query embedding fetched via local transformer model.
   - SQLite search returns top semantic matches.
4. **Ranking**:
   - **Score** = `0.4 * Similarity + 0.3 * DecayedImportance + 0.3 * Recency`.
   - **Decay**: $Importance \cdot e^{-\frac{DecayRate}{1+Emotion} \cdot age}$.
5. **Synthesis**:
   - Contradiction detector flags logic conflicts.
   - Adaptive response engine modifies output tone based on current user traits.

### 2. Memory Hierarchy
- **Sensory**: Immediate context (last 5 messages, in-memory).
- **Short-Term**: Relevant facts with high decay rate ($\lambda = 0.08$).
- **Long-Term**: High importance score ($>0.65$) facts with near-zero decay ($\lambda = 0.01$).

### 3. Privacy & Sync Model
- PRIMARY: SQLite (Local-first, encrypted).
- SYNC: Firebase Bridge for cross-device metadata sync (Optional).
- EXCLUSION: Raw chat data never leaves the local environment; only encrypted summaries and metadata are synced.

### 4. Neural Graph Logic
- Nodes: Dynamic memory clusters created via tag-association.
- Edges: Strength regulated by semantic similarity and co-occurrence in sessions.

### 5. Performance Optimization
- **Quantization**: Embeddings stored as `Float32Array` buffers in SQLite.
- **Lazy Loading**: Transformer models loaded on-demand and cached in `~/.cache`.
- **CPU Parallelization**: Async processing for intent and persona analysis.
