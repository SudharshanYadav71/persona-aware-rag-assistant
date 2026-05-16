import { pipeline, env } from '@xenova/transformers';

// Set cache directory to avoid permission issues
env.allowLocalModels = false;
env.cacheDir = './.cache';

let classifier: any = null;
let nliModelReady = false;

// Load NLI model in background — never block requests
(async () => {
  try {
    classifier = await pipeline('text-classification', 'Xenova/distilbert-base-uncased-mnli');
    nliModelReady = true;
    console.log('[NLI] Contradiction model loaded.');
  } catch (e) {
    console.warn('[NLI] NLI model unavailable, using heuristic fallback:', (e as any)?.message);
  }
})();

/**
 * Heuristic contradiction detection — no model required.
 * Detects direct location/fact conflicts for common patterns.
 */
function heuristicContradiction(text1: string, text2: string): { isContradictory: boolean; confidence: number } {
  const t1 = text1.toLowerCase();
  const t2 = text2.toLowerCase();

  // Extract location mentions
  const locationWords = ['in', 'at', 'to', 'from', 'lives', 'moved', 'works', 'studies'];
  const cities = ['hyderabad', 'delhi', 'bangalore', 'mumbai', 'chennai', 'kolkata', 'pune', 'kadapa'];

  const t1Cities = cities.filter(c => t1.includes(c));
  const t2Cities = cities.filter(c => t2.includes(c));

  // If both mention a city and they differ — likely a contradiction
  if (t1Cities.length > 0 && t2Cities.length > 0) {
    const conflict = t1Cities.some(c => !t2Cities.includes(c)) && t2Cities.some(c => !t1Cities.includes(c));
    if (conflict) return { isContradictory: true, confidence: 0.75 };
  }

  // Check for explicit negations of the same subject
  const sharedWords = t1.split(/\s+/).filter(w => w.length > 4 && t2.includes(w));
  if (sharedWords.length > 0) {
    const t1HasNot = t1.includes("not") || t1.includes("never") || t1.includes("no ");
    const t2HasNot = t2.includes("not") || t2.includes("never") || t2.includes("no ");
    if (t1HasNot !== t2HasNot) return { isContradictory: true, confidence: 0.65 };
  }

  return { isContradictory: false, confidence: 0.5 };
}

export async function checkContradiction(text1: string, text2: string): Promise<{ isContradictory: boolean; confidence: number }> {
  if (!nliModelReady || !classifier) {
    return heuristicContradiction(text1, text2);
  }

  try {
    const nli = classifier;
    const result = await nli([text1, text2]);
    const label = result[0].label.toLowerCase();
    const score = result[0].score;
    if (label === 'contradiction' && score > 0.6) {
      return { isContradictory: true, confidence: score };
    }
    return { isContradictory: false, confidence: score };
  } catch (e) {
    console.warn('[NLI] Inference failed, using heuristic:', (e as any)?.message);
    return heuristicContradiction(text1, text2);
  }
}

/**
 * Optimized batch check for contradictions.
 */
export async function batchCheckContradictions(pairs: [string, string][]): Promise<{ isContradictory: boolean; confidence: number; index: number }[]> {
  if (pairs.length === 0) return [];

  if (!nliModelReady || !classifier) {
    return pairs.map((pair, i) => ({ ...heuristicContradiction(pair[0], pair[1]), index: i }));
  }

  try {
    const nli = classifier;
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
  } catch (e) {
    console.warn('[NLI] Batch inference failed, using heuristics:', (e as any)?.message);
    return pairs.map((pair, i) => ({ ...heuristicContradiction(pair[0], pair[1]), index: i }));
  }
}
