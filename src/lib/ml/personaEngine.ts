import { pipeline, env } from '@xenova/transformers';

// Ensure cache directory
env.allowLocalModels = false;
env.cacheDir = './.cache';

export interface PersonaProfile {
  sentiment: number; // -1 to 1
  formality: number; // 0 to 1
  tone: string;
  emojiDensity: number; // 0 to 1
  punctuationIntensity: number; // 0 to 1
  timestamp: number;
}

let sentimentPipeline: any = null;
let sentimentModelReady = false;

// Load sentiment model in background — never block requests
(async () => {
  try {
    sentimentPipeline = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
    sentimentModelReady = true;
    console.log('[PersonaEngine] Sentiment model loaded.');
  } catch (e) {
    console.warn('[PersonaEngine] Sentiment model unavailable, using heuristic fallback:', (e as any)?.message);
  }
})();

/**
 * Heuristic sentiment analysis — no model required.
 * Returns a value in [-1, 1].
 */
function heuristicSentiment(text: string): number {
  const lower = text.toLowerCase();
  const positive = ['love', 'happy', 'great', 'awesome', 'good', 'excited', 'fantastic', 'excellent', 'wonderful', 'amazing', 'best', 'like', 'enjoy', 'fun', 'nice', 'glad', 'pleased', 'fantastic', 'brilliant'];
  const negative = ['hate', 'bad', 'sad', 'worst', 'terrible', 'awful', 'horrible', 'frustrated', 'angry', 'stressed', 'anxious', 'worried', 'upset', 'disappointed', 'depressed', 'lonely', 'tired', 'exhausted', 'fail', 'failed'];
  let score = 0;
  positive.forEach(w => { if (lower.includes(w)) score += 0.2; });
  negative.forEach(w => { if (lower.includes(w)) score -= 0.2; });
  return Math.max(-1, Math.min(1, score));
}

export class PersonaEngine {
  /**
   * Analyzes a single message and updates the rolling persona profile.
   * Falls back to heuristics if the sentiment model is not ready.
   */
  async analyzeMessage(text: string): Promise<Partial<PersonaProfile>> {
    let sentiment: number;

    if (sentimentModelReady && sentimentPipeline) {
      try {
        const result = await sentimentPipeline(text);
        // SST-2 returns labels like 'POSITIVE' or 'NEGATIVE'
        sentiment = result[0].label === 'POSITIVE' ? result[0].score : -result[0].score;
      } catch (e) {
        console.warn('[PersonaEngine] Sentiment inference failed, using heuristic:', (e as any)?.message);
        sentiment = heuristicSentiment(text);
      }
    } else {
      // Model not ready — use fast heuristic
      sentiment = heuristicSentiment(text);
    }

    const formality = this.estimateFormality(text);
    const emojiDensity = this.calculateEmojiDensity(text);
    const punctuationIntensity = this.calculatePunctuationIntensity(text);

    return {
      sentiment,
      formality,
      emojiDensity,
      punctuationIntensity,
      tone: this.determineTone(sentiment, emojiDensity, punctuationIntensity),
      timestamp: Date.now()
    };
  }

  private calculateEmojiDensity(text: string): number {
    const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
    const matches = text.match(emojiRegex);
    if (!matches) return 0;
    return Math.min(1.0, matches.length / (text.length / 10 + 1));
  }

  private calculatePunctuationIntensity(text: string): number {
    const intensityRegex = /[!?]{2,}|[!?]/g;
    const matches = text.match(intensityRegex);
    if (!matches) return 0;
    let score = 0;
    for (const match of matches) {
      score += match.length > 1 ? 0.3 : 0.1;
    }
    return Math.min(1.0, score);
  }

  private determineTone(sentiment: number, emoji: number, punctuation: number): string {
    if (sentiment > 0.4) {
      if (emoji > 0.3 || punctuation > 0.4) return 'enthusiastic';
      return 'cheerful';
    }
    if (sentiment < -0.4) {
      if (punctuation > 0.5) return 'agitated';
      return 'somber';
    }
    if (emoji > 0.4) return 'playful';
    if (punctuation > 0.6) return 'inquisitive';
    return 'neutral';
  }

  private estimateFormality(text: string): number {
    const casualMarkers = /\b(hey|yo|lol|btw|u|r|gonna|wanna)\b/gi;
    const casualCount = (text.match(casualMarkers) || []).length;
    const wordCount = text.split(/\s+/).length;
    return Math.max(0, 1 - (casualCount / (wordCount / 5)));
  }

  /**
   * Calculates "Drift" between two profiles using simple Euclidean distance
   */
  calculateDrift(p1: Partial<PersonaProfile>, p2: Partial<PersonaProfile>): number {
    const sDiff = Math.pow((p1.sentiment || 0) - (p2.sentiment || 0), 2);
    const fDiff = Math.pow((p1.formality || 0) - (p2.formality || 0), 2);
    const eDiff = Math.pow((p1.emojiDensity || 0) - (p2.emojiDensity || 0), 2);
    const pDiff = Math.pow((p1.punctuationIntensity || 0) - (p2.punctuationIntensity || 0), 2);
    return Math.sqrt(sDiff + fDiff + eDiff + pDiff);
  }

  /**
   * Generates an adaptive response prefix based on current persona state.
   */
  getAdaptiveResponse(baseText: string, profile: Partial<PersonaProfile>): string {
    const sentiment = profile.sentiment || 0;
    const formality = profile.formality || 0.5;

    let prefix = '';
    if (sentiment > 0.6) {
      prefix = formality > 0.7 ? "I am delighted to report that " : "Awesome! ";
    } else if (sentiment < -0.4) {
      prefix = formality > 0.7 ? "Regrettably, " : "I sense some tension — ";
    }

    if (profile.tone === 'somber') {
      return `${prefix}${baseText.charAt(0).toLowerCase()}${baseText.slice(1)} (I sense you're feeling a bit down).`;
    }

    return `${prefix}${baseText}`;
  }

  /**
   * Summarizes state into readable traits
   */
  summarizePersona(profile: Partial<PersonaProfile>): string[] {
    const traits: string[] = [];
    if (profile.sentiment! > 0.4) traits.push('optimistic');
    if (profile.sentiment! < -0.4) traits.push('distressed');
    if (profile.formality! > 0.7) traits.push('formal');
    if (profile.formality! < 0.4) traits.push('casual');
    if (profile.emojiDensity! > 0.5) traits.push('expressive');
    if (profile.punctuationIntensity! > 0.6) traits.push('emphatic');
    if (profile.tone) traits.push(profile.tone);
    return traits;
  }
}
