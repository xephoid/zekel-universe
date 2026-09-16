// Color keys resolve to CSS variables the game sets on the table container,
// exactly as the engine's components do (zekel src/web/components/base.ts):
// var(--zekel-c-<slug>, <stable hashed fallback>). A palette is a stylesheet,
// never a lookup a primitive performs, so a theme can be swapped without
// re-rendering a single card.

import type { CSSProperties } from 'react';
import type { Palette } from './types.js';

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Stable hashed HSL so unthemed keys still get distinct, consistent colors. */
export function fallbackColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 50%, 62%)`;
}

/** CSS color expression for a theme key. */
export function themeColor(key: string | undefined, fallbackKey = 'default'): string {
  const k = key ?? fallbackKey;
  return `var(--zekel-c-${slug(k)}, ${fallbackColor(k)})`;
}

/** Inline style that publishes a palette as the theme variables. */
export function paletteVars(palette: Palette | undefined): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, color] of Object.entries(palette ?? {})) vars[`--zekel-c-${slug(key)}`] = color;
  return vars as CSSProperties;
}

/** Slight randomness in rotation and offset, so stacks look handled. */
export function handledTransform(seed: string, amount = 1): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  const rot = (((h % 100) / 100) * 4 - 2) * amount;
  const dx = ((((h >> 8) % 100) / 100) * 2 - 1) * amount;
  const dy = ((((h >> 16) % 100) / 100) * 2 - 1) * amount;
  return `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
}
