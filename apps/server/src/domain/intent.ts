import type { Emotion, Intent } from './crm.js';

/**
 * Spec §110 — intent and emotion are deterministic keyword classifiers. They
 * run before any model is consulted, and they run identically when no model is
 * configured at all.
 */
interface Matcher {
  intent: Intent;
  /** Higher wins when several patterns match. */
  weight: number;
  patterns: RegExp[];
}

const MATCHERS: Matcher[] = [
  {
    intent: 'ai_probe',
    weight: 10,
    patterns: [
      /\bare\s+you\s+(a\s+)?(real|human|person|bot|ai|a\.i\.|robot|chatbot|machine)\b/i,
      /\b(is\s+this|am\s+i\s+(talking|speaking)\s+to)\s+.{0,20}\b(bot|ai|a\.i\.|robot|human|real\s+person)\b/i,
      /\bdo\s+you\s+actually\s+exist\b/i,
      /\byou'?re\s+(not\s+)?(a\s+)?(bot|ai|robot|real)\b/i,
    ],
  },
  {
    intent: 'unsubscribe',
    weight: 9,
    patterns: [/\b(unsubscribe|stop\s+messaging|leave\s+me\s+alone|don'?t\s+contact|remove\s+me|opt\s*out)\b/i],
  },
  {
    intent: 'complaint',
    weight: 8,
    patterns: [
      /\b(refund|scam|ripped\s+off|didn'?t\s+(get|receive)|never\s+(got|received)|charged\s+twice|complaint)\b/i,
      /\b(this\s+is\s+)?(terrible|awful|unacceptable|disappointed|disappointing)\b/i,
    ],
  },
  {
    intent: 'purchase_interest',
    weight: 7,
    patterns: [
      /\b(how\s+much|price|cost|pricing|buy|purchase|subscribe|subscription|pay|payment|tip)\b/i,
      /\b(do\s+you\s+(sell|offer))\b/i,
    ],
  },
  {
    intent: 'media_request',
    weight: 7,
    patterns: [
      /\b(send|show|share|post)\s+(me\s+)?(a\s+|another\s+|more\s+)?(pic|pics|picture|photo|photos|video|vid|selfie|clip)\b/i,
      /\bcan\s+i\s+(see|get)\b/i,
    ],
  },
  {
    intent: 'support',
    weight: 6,
    patterns: [/\b(help|issue|problem|not\s+working|broken|error|can'?t\s+(log|access|open))\b/i],
  },
  {
    intent: 'compliment',
    weight: 5,
    patterns: [
      /\b(you'?re|you\s+are|you\s+look)\s+.{0,15}\b(beautiful|gorgeous|pretty|amazing|awesome|stunning|cute|hot|perfect|incredible)\b/i,
      /\b(love|adore)\s+(your|you)\b/i,
    ],
  },
  {
    intent: 'personal_disclosure',
    weight: 4,
    patterns: [
      /\bi\s+(feel|felt|am\s+feeling|have\s+been)\b/i,
      /\bmy\s+(job|work|family|wife|husband|girlfriend|boyfriend|mom|dad|day|week)\b/i,
      /\bi\s+(just\s+)?(got|lost|started|quit|moved)\b/i,
    ],
  },
  {
    intent: 'goodbye',
    weight: 4,
    patterns: [/^\s*(bye|goodbye|good\s?night|gn|see\s+ya|talk\s+(to\s+you\s+)?later|ttyl|cya)\b/i],
  },
  {
    intent: 'greeting',
    weight: 3,
    patterns: [/^\s*(hi|hey+|hello+|yo|sup|good\s+(morning|afternoon|evening)|howdy|hiya)\b/i],
  },
  {
    intent: 'question',
    weight: 2,
    patterns: [/\?\s*$/, /^\s*(what|where|when|who|why|how|which|do|does|did|can|could|would|will|are|is)\b/i],
  },
];

export function detectIntent(text: string): Intent {
  const body = text.trim();
  if (!body) return 'other';

  let best: { intent: Intent; weight: number } | null = null;
  for (const m of MATCHERS) {
    if (m.patterns.some((p) => p.test(body))) {
      if (!best || m.weight > best.weight) best = { intent: m.intent, weight: m.weight };
    }
  }
  if (best) return best.intent;
  return body.length < 40 ? 'small_talk' : 'other';
}

const POSITIVE = /\b(love|great|amazing|awesome|happy|excited|thank|thanks|glad|perfect|beautiful|wonderful|nice|good|yes+|haha|lol|😍|❤️|😊|🥰|😂)\b/i;
const NEGATIVE = /\b(hate|awful|terrible|angry|upset|sad|annoyed|frustrated|disappointed|bad|worst|no+pe|ugh|😡|😠|😢|😞)\b/i;
const EXCITED = /(!{2,}|\b(omg|wow|amazing|can'?t\s+wait|so\s+excited)\b|🎉|🔥)/i;
const SAD = /\b(sad|lonely|depressed|miss\s+you|crying|hurt|down)\b/i;
const ANGRY = /\b(angry|furious|pissed|mad\s+at|wtf|scam)\b/i;
const AFFECTIONATE = /\b(love\s+you|miss\s+you|babe|baby|darling|sweetheart|honey)\b/i;
const ANXIOUS = /\b(worried|anxious|nervous|scared|afraid|stressed)\b/i;

export function detectEmotion(text: string): Emotion {
  const body = text.trim();
  if (!body) return 'neutral';
  if (AFFECTIONATE.test(body)) return 'affectionate';
  if (ANGRY.test(body)) return 'angry';
  if (SAD.test(body)) return 'sad';
  if (ANXIOUS.test(body)) return 'anxious';
  if (EXCITED.test(body)) return 'excited';

  const pos = (body.match(new RegExp(POSITIVE, 'gi')) ?? []).length;
  const neg = (body.match(new RegExp(NEGATIVE, 'gi')) ?? []).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/** Intents that should raise a conversation's priority in the inbox. */
const URGENT: Intent[] = ['complaint', 'unsubscribe', 'support', 'purchase_interest'];

export function priorityFor(intent: Intent, emotion: Emotion): number {
  if (URGENT.includes(intent)) return 3;
  if (emotion === 'angry' || emotion === 'negative') return 2;
  if (intent === 'media_request' || intent === 'ai_probe') return 2;
  if (intent === 'question') return 1;
  return 0;
}
