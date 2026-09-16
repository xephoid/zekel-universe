import type { CSSProperties } from 'react';
import { tokens } from '@universe/tokens';

/** Map a game-supplied color key + palette to a concrete color. */
export function paletteColor(key: string | undefined, palette?: Record<string, string>): string {
  if (key && palette?.[key]) return palette[key];
  return tokens.color.border;
}

export const baseCardStyle: CSSProperties = {
  background: 'var(--card)',
  border: '2px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  boxShadow: 'var(--shadow-sm)',
  color: 'var(--fg)',
  fontFamily: 'var(--font-body)',
  padding: '8px 10px',
  cursor: 'default',
  userSelect: 'none',
};

export const litStyle: CSSProperties = {
  boxShadow: '0 0 0 3px var(--highlight)',
  cursor: 'pointer',
};
