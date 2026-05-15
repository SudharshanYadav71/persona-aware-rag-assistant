import { pipeline, env } from '@xenova/transformers';

// Set cache directory to avoid permission issues
env.allowLocalModels = false;
env.cacheDir = './.cache';

let classifier: any = null;

export async function getNLIClassifier() {
  if (!classifier) {
    console.log('[NLI] Loading model: Xenova/distilbert-base-uncased-mnli...');
    classifier = await pipeline('text-classification', 'Xenova/distilbert-base-uncased-mnli');
  }
  return classifier;
}

export async function checkContradiction(text1: string, text2: string): Promise<{ isContradictory: boolean; confidence: number }> {
  const nli = await getNLIClassifier();
  
  // NLI expects "premise [SEP] hypothesis" format for some pipelines, 
  // but for many classification pipelines we just pass the text.
  // Xenova MNLI models usually expect [premise, hypothesis]
  const result = await nli([text1, text2]);
  
  // distilbert-base-uncased-mnli typically has labels: contradiction, neutral, entailment
  // mapped to indices 0, 1, 2 depending on the exactly model config.
  // We can check the label directly.
  
  const label = result[0].label.toLowerCase();
  const score = result[0].score;

  if (label === 'contradiction' && score > 0.6) {
    return { isContradictory: true, confidence: score };
  }

  return { isContradictory: false, confidence: score };
}

/**
 * Optimized batch check for contradictions. 
 * Transformers.js pipelines can handle arrays of inputs.
 */
export async function batchCheckContradictions(pairs: [string, string][]): Promise<{ isContradictory: boolean; confidence: number; index: number }[]> {
  if (pairs.length === 0) return [];
  
  const nli = await getNLIClassifier();
  
  // Format pairs for the model: [ [p1, h1], [p2, h2], ... ]
  // Transformers.js text-classification pipeline supports batching.
  const results = await nli(pairs);
  
  return results.map((result: any, i: number) => {
    const label = result.label.toLowerCase();
    const score = result.score;
    return {
      isContradictory: label === 'contradiction' && score > 0.6,
      confidence: score,
      index: i
    };
  });
}
