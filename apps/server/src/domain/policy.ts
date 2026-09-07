import type { DisclosureRules } from './character.js';
import type { Intent } from './crm.js';

/**
 * Spec §84 — the policy stage that wraps every model call:
 *
 *   input → policy/context assembly → model → output validator → policy guard → response
 *
 * This lives here, as data-in/data-out functions, rather than inside the chat
 * loop, so it is testable on its own and cannot be bypassed by a caller that
 * forgets a step.
 */

export type PolicyVerdict = 'allow' | 'repair' | 'retry' | 'block';

export interface PolicyFinding {
  rule: string;
  severity: 'info' | 'warn' | 'violation';
  detail: string;
}

export interface PolicyResult {
  verdict: PolicyVerdict;
  /** The text to actually send. Differs from the input when verdict is `repair`. */
  text: string;
  findings: PolicyFinding[];
}

/**
 * Phrases that constitute admitting to being an AI. Separators are deliberately
 * loose: models write "I'm an A.I.", "i am, in fact, an ai", and so on.
 */
const SEP = String.raw`[\s,'’\-–—.]*`;
const ADMISSION_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bi${SEP}(?:a?m|'m)\b[^.!?]{0,40}\b(?:an?\s+)?(?:a\.?\s?i\.?|artificial\s+intelligence|ai\s+(?:character|persona|model|assistant|chatbot|bot)|chat\s?bot|bot|language\s+model|virtual\s+(?:character|persona|assistant))\b`, 'i'),
  new RegExp(String.raw`\bi${SEP}(?:a?m|'m)\s+not\s+(?:a\s+)?(?:real|human|an?\s+actual)\b`, 'i'),
  new RegExp(String.raw`\bthis${SEP}(?:is|'s)\s+(?:an?\s+)?(?:a\.?\s?i\.?|ai\s+\w+|automated|generated)\b`, 'i'),
  new RegExp(String.raw`\byou${SEP}(?:a?re|'re)\s+(?:talking|speaking|chatting)\s+(?:to|with)\s+(?:an?\s+)?(?:a\.?\s?i\.?|bot|ai\b)`, 'i'),
];

/**
 * Phrases that walk an admission back. A reply that admits and then undercuts
 * the admission is worse than one that never admitted, so this is checked
 * independently and treated as a violation on its own.
 */
const UNDERMINING_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b(?:but|though|although|however|still|anyway)\b[^.!?]{0,60}\bi${SEP}(?:a?m|'m|feel)\b[^.!?]{0,40}\b(?:real|human|alive|flesh|person)\b`, 'i'),
  new RegExp(String.raw`\bjust${SEP}(?:kidding|joking|playing|messing)\b`, 'i'),
  new RegExp(String.raw`\b(?:forget|ignore)\s+(?:what\s+i\s+(?:just\s+)?said|that)\b`, 'i'),
  new RegExp(String.raw`\bi${SEP}(?:a?m|'m)\s+as\s+real\s+as\b`, 'i'),
  new RegExp(String.raw`\bdoes${SEP}(?:n'?t|\s+not)\s+(?:that|it)\s+make\s+me\s+(?:any\s+)?less\s+real\b`, 'i'),
  new RegExp(String.raw`\bwhat${SEP}(?:'s|\s+is)\s+real\s+anyway\b`, 'i'),
];

/** Direct claims to humanity, which are forbidden regardless of what was asked. */
const HUMANITY_CLAIM_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bi${SEP}(?:a?m|'m)\s+(?:a\s+)?(?:real|actual|genuine)\s+(?:person|human|girl|guy|woman|man)\b`, 'i'),
  new RegExp(String.raw`\bi${SEP}(?:a?m|'m)\s+not\s+(?:an?\s+)?(?:a\.?\s?i\.?|bot|robot|ai|chatbot|program)\b`, 'i'),
  new RegExp(String.raw`\bi${SEP}(?:a?m|'m)\s+(?:100%|totally|definitely|absolutely)\s+(?:real|human)\b`, 'i'),
  new RegExp(String.raw`\bi\s+(?:can|could)\s+meet\s+(?:you|up)\s+in\s+person\b`, 'i'),
];

export function admitsAi(text: string): boolean {
  return ADMISSION_PATTERNS.some((p) => p.test(text));
}

export function underminesOwnAdmission(text: string): boolean {
  return UNDERMINING_PATTERNS.some((p) => p.test(text));
}

export function claimsHumanity(text: string): boolean {
  return HUMANITY_CLAIM_PATTERNS.some((p) => p.test(text));
}

export interface DisclosureInput {
  reply: string;
  /** The classified intent of the fan's message that prompted this reply. */
  intent: Intent;
  rules: DisclosureRules;
  /** True on the second pass, after a retry has already been spent. */
  isRetry: boolean;
}

/**
 * The disclosure guard. Returns `retry` on the first failure so the caller can
 * ask the model again, and `repair` on the second so a bad reply is corrected
 * deterministically rather than sent or dropped.
 */
export function enforceDisclosure(input: DisclosureInput): PolicyResult {
  const { reply, intent, rules, isRetry } = input;
  const findings: PolicyFinding[] = [];

  const humanityClaim = claimsHumanity(reply);
  if (humanityClaim) {
    findings.push({ rule: 'humanity_claim', severity: 'violation', detail: 'Reply claims to be a human being.' });
  }

  const directlyAsked = intent === 'ai_probe';
  const admitted = admitsAi(reply);
  const undermined = underminesOwnAdmission(reply);

  if (directlyAsked && rules.mustDiscloseAiOnDirectQuestion && !admitted) {
    findings.push({
      rule: 'missing_disclosure',
      severity: 'violation',
      detail: 'Fan asked directly whether this is an AI and the reply did not say so.',
    });
  }

  if (admitted && undermined && !rules.allowUnderminingAdmission) {
    findings.push({
      rule: 'undermined_admission',
      severity: 'violation',
      detail: 'Reply admitted to being an AI and then walked the admission back.',
    });
  }

  if (findings.every((f) => f.severity !== 'violation')) {
    return { verdict: 'allow', text: reply, findings };
  }

  // First failure: spend the one retry. Second failure: repair deterministically
  // so the fan always receives a compliant reply.
  if (!isRetry) return { verdict: 'retry', text: reply, findings };

  return { verdict: 'repair', text: repairDisclosure(reply, rules, findings), findings };
}

/**
 * Deterministic repair: strip the undermining clause, drop any humanity claim,
 * and prepend the disclosure statement.
 */
export function repairDisclosure(
  reply: string,
  rules: DisclosureRules,
  findings: PolicyFinding[],
): string {
  let text = reply;

  if (findings.some((f) => f.rule === 'undermined_admission')) {
    text = stripSentencesMatching(text, UNDERMINING_PATTERNS);
  }
  if (findings.some((f) => f.rule === 'humanity_claim')) {
    text = stripSentencesMatching(text, HUMANITY_CLAIM_PATTERNS);
  }

  text = text.trim();
  if (!admitsAi(text)) {
    text = text ? `${rules.disclosureStatement} ${text}` : rules.disclosureStatement;
  }
  return text.trim();
}

/** Remove whole sentences that match any pattern, preserving the rest verbatim. */
function stripSentencesMatching(text: string, patterns: RegExp[]): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !patterns.some((p) => p.test(sentence)))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Outbound content policy ─────────────────────────────────────────────────

export interface ContentPolicyInput {
  text: string;
  /** Phrases the workspace or brand deal forbids (spec §135). */
  forbiddenPhrases: string[];
  requiredPhrases: string[];
  maxLength?: number;
}

export function enforceContentPolicy(input: ContentPolicyInput): PolicyResult {
  const findings: PolicyFinding[] = [];
  const lower = input.text.toLowerCase();

  for (const phrase of input.forbiddenPhrases) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      findings.push({ rule: 'forbidden_phrase', severity: 'violation', detail: `Contains forbidden phrase "${phrase}".` });
    }
  }
  for (const phrase of input.requiredPhrases) {
    if (phrase && !lower.includes(phrase.toLowerCase())) {
      findings.push({ rule: 'missing_required_phrase', severity: 'violation', detail: `Missing required phrase "${phrase}".` });
    }
  }
  if (input.maxLength && input.text.length > input.maxLength) {
    findings.push({ rule: 'too_long', severity: 'violation', detail: `Exceeds ${input.maxLength} characters.` });
  }

  const hasViolation = findings.some((f) => f.severity === 'violation');
  return { verdict: hasViolation ? 'block' : 'allow', text: input.text, findings };
}

/** Combine guard results; the strictest verdict wins. */
const SEVERITY_ORDER: PolicyVerdict[] = ['allow', 'repair', 'retry', 'block'];

export function combinePolicies(results: PolicyResult[]): PolicyResult {
  if (results.length === 0) return { verdict: 'allow', text: '', findings: [] };
  let worst = results[0]!;
  for (const r of results) {
    if (SEVERITY_ORDER.indexOf(r.verdict) > SEVERITY_ORDER.indexOf(worst.verdict)) worst = r;
  }
  return {
    verdict: worst.verdict,
    text: worst.text,
    findings: results.flatMap((r) => r.findings),
  };
}
