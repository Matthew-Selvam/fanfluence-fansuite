import type { CreativeBriefSpec } from '../domain/studio.js';
import type { VisualIdentity } from '../domain/character.js';

/**
 * Spec §83/§112 — deterministic prompt assembly.
 *
 * This is pure string composition with no model involved, which is what lets
 * Photo Studio "build brief → export prompt" work with no provider connected
 * at all. An AI provider, when present, refines this; it never replaces it.
 */

export interface PromptInputs {
  spec: CreativeBriefSpec;
  character: {
    name: string;
    gender?: string | null;
    age?: number | null;
    visual?: VisualIdentity | null;
  } | null;
  outfitDescription?: string | null;
  locationDescription?: string | null;
  propsDescription?: string | null;
  brandRules?: { visualDos?: string[]; visualDonts?: string[] } | null;
}

export interface BuiltPrompt {
  prompt: string;
  negativePrompt: string;
  /** Every clause that went in, so the UI can show why the prompt reads as it does. */
  segments: Array<{ label: string; text: string }>;
}

const LABELS: Record<string, string> = {
  sunrise: 'at sunrise', morning: 'in the morning', afternoon: 'in the afternoon',
  golden_hour: 'during golden hour', sunset: 'at sunset', blue_hour: 'during blue hour',
  night: 'at night',
  at_camera: 'looking directly at the camera', away: 'looking away from the camera',
  down: 'looking downward', side_glance: 'giving a side glance', closed_eyes: 'with eyes closed',
  product_focused: 'in a product-focused pose', mid_laugh: 'mid-laugh',
};

const humanise = (value: string): string => LABELS[value] ?? value.replace(/_/g, ' ');

export function buildPrompt(inputs: PromptInputs): BuiltPrompt {
  const segments: Array<{ label: string; text: string }> = [];
  const push = (label: string, text: string | null | undefined) => {
    const trimmed = text?.trim();
    if (trimmed) segments.push({ label, text: trimmed });
  };

  const { spec, character } = inputs;

  // Subject
  if (character) {
    const traits = [
      character.age ? `${character.age}-year-old` : null,
      character.gender ?? null,
      character.visual?.build ?? null,
    ].filter(Boolean).join(' ');
    push('subject', traits ? `${traits}, ${character.name}` : character.name);

    push('features', [
      character.visual?.hair ? `${character.visual.hair} hair` : null,
      character.visual?.eyes ? `${character.visual.eyes} eyes` : null,
      character.visual?.skinTone ?? null,
      ...(character.visual?.distinguishingFeatures ?? []),
    ].filter(Boolean).join(', '));
  }

  // Scene
  const scene = spec.scene;
  push('location', inputs.locationDescription ?? scene?.customLocation ?? (scene?.location ? humanise(scene.location) : null));
  push('environment', scene?.environment);
  push('time', scene?.time ? humanise(scene.time) : null);

  // Subject direction
  const subject = spec.subject;
  push('pose', subject?.customPose ?? (subject?.pose ? humanise(subject.pose) : null));
  push('expression', subject?.expression ? `${humanise(subject.expression)} expression` : null);
  push('gaze', subject?.gaze ? humanise(subject.gaze) : null);
  // A locked hairstyle is stated explicitly so the provider does not reinterpret it.
  push('hair', subject?.hair ? (subject.hairLocked ? `hair exactly as described: ${subject.hair}` : subject.hair) : null);

  // Wardrobe and props
  push('outfit', inputs.outfitDescription ?? spec.outfit?.custom ?? spec.outfit?.preset);
  push('props', inputs.propsDescription ?? spec.props?.description);

  // Visual direction
  const direction = spec.direction;
  push('style', direction?.style ? `${humanise(direction.style)} style` : null);
  push('camera', direction?.camera);
  push('lighting', direction?.lighting);
  push('aesthetic', character?.visual?.aesthetic);
  push('notes', direction?.notes);

  // Brand rules become positive constraints (§135).
  for (const rule of inputs.brandRules?.visualDos ?? []) push('brand', rule);

  // Output framing
  const aspect = spec.output?.aspect;
  if (aspect && aspect !== 'custom') push('framing', `${aspect} aspect ratio`);

  const negatives = [
    direction?.negativePrompt,
    ...(inputs.brandRules?.visualDonts ?? []),
    ...DEFAULT_NEGATIVES,
  ].filter((v): v is string => Boolean(v?.trim()));

  return {
    prompt: segments.map((s) => s.text).join(', '),
    negativePrompt: dedupe(negatives).join(', '),
    segments,
  };
}

/**
 * Quality negatives applied to every generation. Kept short and generic so a
 * provider that ignores negatives is not materially worse off.
 */
const DEFAULT_NEGATIVES = [
  'blurry', 'low resolution', 'distorted anatomy', 'extra limbs',
  'watermark', 'text overlay', 'jpeg artifacts',
];

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Spec §112 — the exportable brief, for when no provider is connected. This is
 * what "Export prompt / queue external generation later" hands the user.
 */
export function exportBrief(inputs: PromptInputs, built: BuiltPrompt): string {
  const lines = [
    '# Creative Brief',
    '',
    '## Prompt',
    built.prompt,
    '',
    '## Negative prompt',
    built.negativePrompt,
    '',
    '## Output',
    `Aspect: ${inputs.spec.output?.aspect ?? '9:16'}`,
    `Resolution: ${inputs.spec.output?.resolution ?? 'provider default'}`,
    `Variants: ${inputs.spec.output?.variants ?? 1}`,
  ];

  if (inputs.spec.references?.characterReferenceAssetIds?.length) {
    lines.push('', '## References', ...inputs.spec.references.characterReferenceAssetIds.map((id) => `- ${id}`));
    if (inputs.spec.references.strictIdentity) {
      lines.push('', 'Strict identity: only the approved references above may be used.');
    }
  }

  lines.push('', '## Segments', ...built.segments.map((s) => `- **${s.label}**: ${s.text}`));
  return lines.join('\n');
}
