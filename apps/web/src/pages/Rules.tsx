// The rules, as the engine states them, on their own page so a game page
// can link to them (and a designer may also link a rulebook elsewhere).

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameCatalogEntry, GameReferenceResponse } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { Nav } from './Nav';

export interface RulesSection {
  heading: string;
  slug: string;
  paragraphs: string[];
}

export interface RulesSections {
  intro: string[];
  sections: RulesSection[];
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*\n|\s+$/g, ''))
    .filter((p) => p.trim() !== '');
}

export function rulesSlug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-');
}

// Splits the engine's rules text at lines that start with "## ". Text before
// the first heading is the intro. With no headings at all, `sections` is
// empty and the page shows the text as it came. Lines of only "---" are
// dropped: they separate nothing the headings don't already.
export function splitRulesSections(rules: string): RulesSections {
  const lines = rules.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '---');
  const intro: string[] = [];
  const sections: { heading: string; body: string[] }[] = [];
  let current: string[] = intro;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = [];
      sections.push({ heading: line.slice(3).trim(), body: current });
    } else current.push(line);
  }
  const used = new Map<string, number>();
  return {
    intro: paragraphsOf(intro.join('\n')),
    sections: sections.map((sec, i) => {
      const base = rulesSlug(sec.heading) || `section-${i + 1}`;
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      return { heading: sec.heading, slug: n > 1 ? `${base}-${n}` : base, paragraphs: paragraphsOf(sec.body.join('\n')) };
    }),
  };
}

function RulesBody({ rules }: { rules: string }) {
  const { intro, sections } = splitRulesSections(rules);
  if (!sections.length) return <div className="rules-text rules-plain">{rules}</div>;
  return (
    <>
      <nav className="rules-toc" aria-label="Sections">
        <ul>
          {sections.map((s) => <li key={s.slug}><a href={`#${s.slug}`}>{s.heading}</a></li>)}
        </ul>
      </nav>
      <div className="rules-text">
        {intro.length > 0 && (
          <div className="rules-section rules-intro">
            {intro.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        )}
        {sections.map((s) => (
          <section key={s.slug} className="rules-section">
            <h2 id={s.slug}>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
      </div>
    </>
  );
}

export function RulesPage() {
  const { id = '' } = useParams();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.game(id).then((r) => setGame(r.game)).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
    api.reference(id).then(setReference).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
  }, [id]);

  return (
    <div>
      <Nav />
      <div className="page narrow stack" style={{ paddingTop: 28 }}>
        <Link to={`/games/${id}`} className="crumb">‹ {game?.name ?? 'The game'}</Link>
        <h1>{game ? `${game.name}: the rules` : 'The rules'}</h1>
        {err && <p className="error">{err}</p>}
        {game?.rulesUrl && <p><a href={game.rulesUrl} target="_blank" rel="noreferrer">The printed rulebook</a></p>}
        {reference ? (
          <RulesBody rules={reference.rules} />
        ) : !err ? <p className="muted">Loading…</p> : null}
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>These rules are the engine's own text: the same rules the table enforces.</p>
      </div>
    </div>
  );
}
