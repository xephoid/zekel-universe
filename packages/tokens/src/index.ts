// Design tokens from docs/design-brief.md: warm-but-flat look.
// Published as a TypeScript object and as CSS variables (tokens.css); both
// apps and the primitives read from here and nowhere else.

export const tokens = {
  color: {
    brand: {
      green: '#1F4D3A',
      orange: '#E0762B', // the all-orange meeple in the wordmark
      orangeHover: '#C9662A',
    },
    // Light theme (default)
    bg: '#F7F1E6',        // warm paper
    bgRaised: '#FFFEFA',
    fg: '#1C1A17',
    fgMuted: '#6E6558',
    accent: '#1F4D3A',
    border: '#DDD3C4',
    card: '#FFFEFA',
    cardBack: '#5B6B7A',
    // Dark theme
    dark: {
      bg: '#1A221C',
      bgRaised: '#232E26',
      fg: '#F3EAD9',
      fgMuted: '#B1AC9F',
      accent: '#9BB08A',
      border: '#3A443C',
      card: '#232E26',
      cardBack: '#3E4A57',
      orange: '#FF8A3D',
    },
    danger: '#B3261E',
    highlight: '#E6EFE9', // selection and turn-pill glow
    lit: '#E0762B', // legal-move ring, light theme (dark: the brighter orange)
  },
  font: {
    body: "'IBM Plex Sans', system-ui, sans-serif",
    display: "'Bricolage Grotesque', 'IBM Plex Sans', system-ui, sans-serif",
    wordmark: "'Slackey', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
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
