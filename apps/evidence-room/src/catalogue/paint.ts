/** Small drawing helpers shared by the catalogue scene, the card face and the legend. */
import type { CardView, Lens, LensGroup } from '../domain/catalogue';
import { groupOf } from '../domain/catalogue';

/** CSS colour of a lens group tone (status, ageing bucket, priority, owner c0..c7, none). */
export const toneFill = (tone: string) => `var(--lens-${tone})`;

export function cardFill(card: CardView, lens: Lens, groups: LensGroup[]): string {
  return toneFill(groupOf(card, lens, groups).tone);
}

/** Cut a string to fit a width, given an average character width. */
export function fit(text: string, maxPx: number, charPx: number): string {
  const n = Math.max(1, Math.floor(maxPx / charPx));
  if (text.length <= n) return text;
  return `${text.slice(0, Math.max(1, n - 1)).trimEnd()}…`;
}

/** Wrap text into at most `lines` lines of about `perLine` characters, breaking on spaces. */
export function wrap(text: string, perLine: number, lines: number): string[] {
  const all: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine) cur = next;
    else {
      if (cur) all.push(cur);
      cur = w.length > perLine ? `${w.slice(0, perLine - 1)}…` : w;
    }
  }
  if (cur) all.push(cur);
  if (all.length <= lines) return all;
  const out = all.slice(0, lines);
  const last = out[lines - 1];
  out[lines - 1] = `${last.length >= perLine ? last.slice(0, perLine - 1).trimEnd() : last}…`;
  return out;
}

/** Deterministic pseudo-random numbers (mulberry32) for wood grain and paper. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wavy grain lines across a w×h panel. */
export function grainPaths(w: number, h: number, seed: number, count = 18): { d: string; o: number; sw: number }[] {
  const r = rng(seed);
  const out: { d: string; o: number; sw: number }[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = (h * (i + r() * 0.8)) / count;
    const amp = 1.5 + r() * 3.5;
    const k = 2 + Math.floor(r() * 3);
    let d = `M ${-10} ${y0.toFixed(1)}`;
    const seg = (w + 20) / (k * 2);
    for (let s = 0; s < k * 2; s++) {
      const x1 = -10 + seg * (s + 0.5);
      const x2 = -10 + seg * (s + 1);
      const dy = (s % 2 ? -1 : 1) * amp * (0.6 + r() * 0.8);
      d += ` Q ${x1.toFixed(1)} ${(y0 + dy).toFixed(1)} ${x2.toFixed(1)} ${(y0 + (r() - 0.5) * 1.5).toFixed(1)}`;
    }
    out.push({ d, o: 0.35 + r() * 0.65, sw: 0.6 + r() * 1.4 });
  }
  // A knot now and then.
  if (r() > 0.55) {
    const cx = w * (0.2 + r() * 0.6);
    const cy = h * (0.25 + r() * 0.5);
    for (let j = 0; j < 3; j++) {
      const rx = 6 + j * 5 + r() * 2;
      out.push({ d: `M ${cx - rx} ${cy} a ${rx} ${rx * 0.38} 0 1 0 ${rx * 2} 0 a ${rx} ${rx * 0.38} 0 1 0 ${-rx * 2} 0`, o: 0.5, sw: 0.8 });
    }
  }
  return out;
}

export function initialsOf(name: string | null): string {
  if (!name) return '–';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? (p[p.length - 1][0] ?? '') : '')).toUpperCase();
}
