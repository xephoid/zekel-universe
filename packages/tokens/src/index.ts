// Design tokens from docs/design-brief.md: warm-but-flat look.
// Published as a TypeScript object and as CSS variables (tokens.css); both
// apps and the primitives read from here and nowhere else.

export const tokens = {
  color: {
    brand: {
      green: '#3E7C4F',
      orange: '#E8862E', // meeple head in the wordmark
    },
    // Light theme (default)
    bg: '#F5F0E8',        // warm paper
    bgRaised: '#FDFBF7',
    fg: '#2B2620',
    fgMuted: '#6E6558',
    accent: '#3E7C4F',
    border: '#DDD3C4',
    card: '#FDFBF7',
    cardBack: '#5B6B7A',
    // Dark theme
    dark: {
      bg: '#221E19',
      bgRaised: '#2C2721',
      fg: '#EFE8DC',
      fgMuted: '#A79B89',
      accent: '#5FA873',
      border: '#453E34',
      card: '#2C2721',
      cardBack: '#3E4A57',
    },
    danger: '#B4452F',
    highlight: '#FFD97A', // lit-part glow for legal moves
  },
  font: {
    body: "'Nunito', system-ui, sans-serif",
    display: "'Fredoka', 'Nunito', system-ui, sans-serif",
    mono: "ui-monospace, 'Cascadia Code', monospace",
  },
  radius: { sm: '4px', md: '8px', lg: '14px', round: '999px' },
  shadow: {
    // flat look: shadows are small and warm, never blurry-gray
    sm: '0 1px 0 rgba(43,38,32,0.12)',
    md: '0 2px 0 rgba(43,38,32,0.14)',
    lift: '0 10px 18px rgba(43,38,32,0.28)',
  },
  motion: {
    fast: '120ms',
    normal: '240ms',
    slow: '480ms',
    slide: '360ms', // pieces sliding along paths, cards flying
    flip: '320ms',
    drop: '420ms', // tokens dropping and settling
    tumble: '640ms', // dice
    easing: 'cubic-bezier(0.3, 0.8, 0.4, 1)',
    settle: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)',
  },
} as const;

export type Tokens = typeof tokens;

/** Motion durations as numbers (ms), for code that schedules alongside CSS. */
export const motionMs = {
  fast: 120,
  normal: 240,
  slow: 480,
  slide: 360,
  flip: 320,
  drop: 420,
  tumble: 640,
} as const;
