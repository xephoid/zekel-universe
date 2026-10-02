// Is this a phone? One question, asked one way, so the table's chrome and a
// game's screen always agree (docs/games/fractured-fist-arcade-build.md,
// item 7). Only a game whose glue says it has a phone layout
// (GlueModule.phone) acts on the answer; every other table keeps its
// desktop layout until the brief's phone pass.

import { useEffect, useState } from 'react';

/** Narrower than this is a phone held upright. The boards are 390 wide. */
export const PHONE_QUERY = '(max-width: 640px)';

function matches(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
}

export function usePhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
