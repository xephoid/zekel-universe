// Small pieces every page shares, drawn as the design canvas draws them:
// the wordmark (the k as the all-orange meeple on its back), the avatar
// circle with an initial on a color, and the flat cover placeholder.

import type { CSSProperties } from 'react';
import type { GameCatalogEntry } from '@universe/shared';

/** The only brand mark: "zekel" in Slackey, the k a meeple lying on its back. */
export function Wordmark({ size = 24, className }: { size?: number; className?: string }) {
  const k = size * 0.83;
  return (
    <span className={`wordmark${className ? ` ${className}` : ''}`} style={{ fontSize: size }} aria-label="zekel">
      ze<span className="meeple" style={{ width: k, height: k }} aria-hidden="true"><span className="hd" /><span className="sh" /><span className="bd" /><span className="l1" /><span className="l2" /></span>el
    </span>
  );
}

/** A stable hue for a name, so the same person or game keeps its color. */
export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function colorFor(name: string): string {
  return `hsl(${hashHue(name)}, 60%, 62%)`;
}

/** The avatar circle: an initial on a color with the ink border. */
export function Avatar({ name, size = 32, color, className, style }: {
  name: string; size?: number; color?: string; className?: string; style?: CSSProperties;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, background: color ?? colorFor(name), fontSize: Math.round(size * 0.4), ...style }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** Flat placeholder cover from the canvas: one colored field, giant initial,
 *  and the honest label until real art arrives. */
export function Cover({ game, size = 'large' }: { game: GameCatalogEntry; size?: 'large' | 'small' | 'tile' }) {
  if (game.coverImage) return <img src={game.coverImage} alt="" className={`gpcover ${size}`} />;
  const hue = hashHue(game.engineGameId);
  return (
    <div className={`gpcover ${size}`} style={{ background: `hsl(${hue}, 46%, 52%)` }}>
      <span className="initial" style={{ color: `hsl(${hue}, 46%, 96%)` }}>{game.name.slice(0, 1)}</span>
      {size !== 'tile' && <span className="tag" style={{ color: `hsl(${hue}, 46%, 92%)` }}>cover art</span>}
    </div>
  );
}

/** "2–5 players", "2 players", "1 player": from the catalog's count string. */
export function playersLabel(playerCount: string): string {
  return playerCount.trim() === '1' ? '1 player' : `${playerCount} players`;
}

/** A "when" for a post or a table, as the canvas writes it. */
export function whenLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
