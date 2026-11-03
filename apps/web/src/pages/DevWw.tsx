// Development only: Warble Way Galaxy's icons (build item 2) drawn in the
// hologram logbook theme, to compare with the icon rows on Main.dc.html. The
// fixed meanings first at the card kinds' size, then every shape at the
// inline size. The route exists only in the dev server.

import '../glue/ww/ww.css';
import { ICON_FILES, Icon, MEANINGS, MeaningIcon, type IconName, type Meaning } from '../glue/ww/icons';

const KIND_COLOURS: Partial<Record<Meaning, string>> = {
  recruit: 'var(--ww-recruit)', being: 'var(--ww-recruit)', pirate: 'var(--ww-pirate)', attacker: 'var(--ww-pirate)',
  ruin: 'var(--ww-ruin)', hazard: 'var(--ww-hazard)', job: 'var(--ww-job)', dread: 'var(--ww-dread)', damage: 'var(--ww-redshirt)',
};

const HEADING = { font: '600 12px/1 var(--ww-sign)', letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ww-muted)', marginTop: 32 };

export function DevWwPage() {
  return (
    <div className="table-shell ww-theme" style={{ minHeight: '100vh', padding: 24, fontFamily: 'var(--font-body)' }}>
      <h1 style={{ ...HEADING, fontSize: 15, fontWeight: 700, marginTop: 0 }}>Warble Way Galaxy · icons</h1>
      <h2 style={HEADING}>Fixed meanings</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 12 }}>
        {(Object.keys(MEANINGS) as Meaning[]).map((m) => (
          <figure key={m} style={{ margin: 0, textAlign: 'center', color: KIND_COLOURS[m] ?? 'var(--ww-gold)' }}>
            <MeaningIcon meaning={m} size={52} label={m} />
            <figcaption style={{ ...HEADING, fontSize: 11, marginTop: 8 }}>{m}</figcaption>
          </figure>
        ))}
      </div>
      <h2 style={HEADING}>Every shape</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
        {(Object.keys(ICON_FILES) as IconName[]).map((n) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ww-star)' }}>
            <Icon name={n} />
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ww-muted)' }}>{n}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
