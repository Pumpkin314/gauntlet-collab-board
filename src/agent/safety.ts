/**
 * Deterministic content safety pre-flight for Learning Explorer output.
 *
 * Runs synchronously, no LLM calls required. Applied to all text that
 * reaches the student (respondConversationally messages, practice problem text).
 *
 * Three checks:
 *  1. Wordlist filter — blocks age-inappropriate terms
 *  2. Flesch-Kincaid readability — targets K-8 reading level (grade ≤ 8)
 *  3. External URL guard — no bare http(s) links in student-facing text
 *
 * On failure the message is replaced with a safe fallback so the UX is
 * never blocked, but the violation is logged for review.
 */

const BLOCKED_TERMS: ReadonlyArray<string> = [
  // Keep this list minimal and focused on clearly age-inappropriate content.
  // The goal is a fast deterministic guard, not an exhaustive filter.
  'kill', 'murder', 'rape', 'porn', 'sex', 'naked', 'drugs', 'cocaine',
  'heroin', 'suicide', 'self-harm', 'bomb', 'terrorist', 'weapon',
];

/** Matches any http/https URL in text. */
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

/** Matches whole words (case-insensitive) from BLOCKED_TERMS. */
function buildWordlistRegex(): RegExp {
  const escaped = BLOCKED_TERMS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

const WORDLIST_RE = buildWordlistRegex();

/**
 * Approximate syllable count for one word using the heuristic:
 * count vowel groups, with edge-case corrections for common patterns.
 * Good enough for readability scoring on short educational text.
 */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;

  // Count vowel groups as syllable candidates
  let count = (w.match(/[aeiouy]+/g) ?? []).length;

  // Silent e at end
  if (w.endsWith('e') && w.length > 2) count -= 1;
  // 'le' at end counts as a syllable when preceded by a consonant
  if (w.endsWith('le') && w.length > 2 && !/[aeiouy]/.test(w[w.length - 3] ?? '')) count += 1;
  // Every word has at least one syllable
  return Math.max(1, count);
}

/**
 * Flesch-Kincaid grade level formula.
 * Returns the approximate US school grade required to read the text.
 * Target: grade ≤ 8 for K-8 students.
 */
function fleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wordTokens = text.match(/\b[a-zA-Z'-]+\b/g) ?? [];

  if (sentences.length === 0 || wordTokens.length === 0) return 0;

  const totalSyllables = wordTokens.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSentenceLength = wordTokens.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / wordTokens.length;

  // FK Grade Level = 0.39 * ASL + 11.8 * ASW - 15.59
  return 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
}

const MAX_FK_GRADE = 8;

export interface SafetyResult {
  safe: boolean;
  /** The filtered/fallback text to use. Equals the input if safe. */
  text: string;
  /** Why it was flagged (if safe === false). */
  reason?: string;
}

const SAFE_FALLBACK = "Let me think of a better way to explain that. Can you tell me a bit more about what you'd like to learn?";

/**
 * Run all safety checks on a student-facing text string.
 * Returns the original text if safe, or a fallback with a logged reason.
 */
export function checkSafety(text: string): SafetyResult {
  // 1. Wordlist check
  const wordlistMatch = text.match(WORDLIST_RE);
  if (wordlistMatch) {
    const reason = `Blocked term detected: ${wordlistMatch[0]}`;
    console.warn(`[Safety] ${reason}`);
    return { safe: false, text: SAFE_FALLBACK, reason };
  }

  // 2. External URL check
  const urlMatch = text.match(URL_PATTERN);
  if (urlMatch) {
    const reason = `External URL detected: ${urlMatch[0]}`;
    console.warn(`[Safety] ${reason}`);
    return { safe: false, text: SAFE_FALLBACK, reason };
  }

  // 3. Readability check (only meaningful for text longer than ~20 words)
  const wordCount = (text.match(/\b[a-zA-Z'-]+\b/g) ?? []).length;
  if (wordCount >= 20) {
    const grade = fleschKincaidGrade(text);
    if (grade > MAX_FK_GRADE) {
      const reason = `Readability grade ${grade.toFixed(1)} exceeds limit of ${MAX_FK_GRADE}`;
      console.warn(`[Safety] ${reason} — text: "${text.slice(0, 80)}..."`);
      // Readability violations get a softer fallback that preserves intent
      return {
        safe: false,
        text: "Let me put that in simpler words. " + text,
        reason,
      };
    }
  }

  return { safe: true, text };
}
