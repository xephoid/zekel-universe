// A multi pick drawn as its own screen (docs/design/Fractured Fist
// Loadout.dc.html): the options in sections, each a card with its badge,
// its effect chips and a tag; the picks in numbered slots with what they
// add up to; a preset the player may take with one press. Nothing is
// preselected, and a pick past the limit says why instead of swapping.

import { useState } from 'react';
import type { MultiOption, SetupField } from '../glue';

export type GroupedField = Extract<SetupField, { kind: 'multi' }> & { groups: NonNullable<Extract<SetupField, { kind: 'multi' }>['groups']> };

export function isGrouped(f: SetupField): f is GroupedField {
  return f.kind === 'multi' && Array.isArray(f.groups) && f.groups.length > 0;
}

function optionsOf(f: GroupedField, group: string): MultiOption[] {
  return f.options.filter((o) => (o.group ?? 'none') === group);
}

/** The sections of option cards, with the preset and clear buttons above. */
export function GroupedPicker({ field, picked, onToggle, onSet }: {
  field: GroupedField; picked: string[]; onToggle: (value: string) => void; onSet: (values: string[]) => void;
}) {
  const [warn, setWarn] = useState<string | null>(null);
  const noun = field.noun ?? 'pick';
  const toggle = (o: MultiOption) => {
    if (!picked.includes(o.value) && picked.length >= field.pick) {
      setWarn(`${words(field.pick)} is the limit. Take one out first, then add ${o.label}.`);
      return;
    }
    setWarn(null);
    onToggle(o.value);
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row-head" style={{ alignItems: 'center' }}>
        <span className="label" style={{ fontSize: 14, fontWeight: 600 }}>{field.label} · {picked.length} of {field.pick}</span>
        {field.help && <span className="muted" style={{ fontSize: 13 }}>{field.help}</span>}
      </div>
      <div className="pick-tools">
        {field.preset && <button type="button" className="chip-btn" onClick={() => { setWarn(null); onSet(field.preset!.values.slice(0, field.pick)); }}>{field.preset.label}</button>}
        <button type="button" className="chip-btn" disabled={picked.length === 0} onClick={() => { setWarn(null); onSet([]); }}>Clear</button>
        <span style={{ flex: 1 }} />
        {warn && <span className="pick-warn" role="alert">{warn}</span>}
      </div>
      {field.groups.map((g) => {
        const list = optionsOf(field, g.key);
        if (list.length === 0) return null;
        return (
          <div key={g.key} className="pick-group">
            <div className="pick-group-head">
              <span className="dot" style={{ background: g.color ?? 'var(--border)' }} />
              <span className="name">{g.label}</span>
              <span className="count">{list.length} {noun}{list.length === 1 ? '' : 's'}</span>
              {g.note && <span className="muted">{g.note}</span>}
            </div>
            <div className="option-grid four pick-grid" role="group" aria-label={g.label}>
              {list.map((o) => {
                const on = picked.includes(o.value);
                const full = !on && picked.length >= field.pick;
                return (
                  <button
                    key={o.value} type="button" className={`option-card pick-card${on ? ' on' : ''}`} aria-pressed={on}
                    aria-label={on ? `Remove ${o.label}` : `Add ${o.label}`}
                    title={full ? 'Take one out first' : on ? `Take ${o.label} out` : `Add ${o.label}`}
                    style={{ borderTopColor: g.color ?? undefined }}
                    onClick={() => toggle(o)}
                  >
                    <span className="head"><span className="name">{o.label}</span>{o.badge && <span className="badge">{o.badge}</span>}</span>
                    {o.chips && o.chips.length > 0 && <span className="chips">{o.chips.map((c) => <span key={c} className="fx-chip">{c}</span>)}</span>}
                    <span className={`tag${on ? ' on' : ''}`}>{on ? `in your ${words(field.pick).toLowerCase()}` : (o.tag ?? '')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The numbered slots and the totals, for the summary column. */
export function PickSlots({ field, picked, onRemove }: { field: GroupedField; picked: string[]; onRemove: (value: string) => void }) {
  const byValue = new Map(field.options.map((o) => [o.value, o] as const));
  const colorOf = (o: MultiOption | undefined) => field.groups.find((g) => g.key === (o?.group ?? 'none'))?.color ?? 'var(--border)';
  const totals = field.summarize ? field.summarize(picked) : null;
  return (
    <div className="pick-slots">
      <div className="row-head" style={{ justifyContent: 'space-between' }}>
        <span className="name" style={{ fontWeight: 700 }}>Your {words(field.pick).toLowerCase()}</span>
        <span className={`count${picked.length === field.pick ? ' full' : ''}`}>{picked.length}/{field.pick}</span>
      </div>
      <ol>
        {Array.from({ length: field.pick }, (_, i) => {
          const v = picked[i];
          const o = v ? byValue.get(v) : undefined;
          if (!v || !o) return <li key={i} className="slot empty"><span className="n">{i + 1}</span><span className="muted">empty</span></li>;
          return (
            <li key={v} className="slot">
              <span className="n">{i + 1}</span>
              <span className="dot" style={{ background: colorOf(o) }} />
              <span className="name">{o.label}</span>
              {o.chips && <span className="fx muted">{o.chips.join(', ')}</span>}
              {o.badge && <span className="badge">{o.badge}</span>}
              <button type="button" className="remove" aria-label={`Remove ${o.label}`} onClick={() => onRemove(v)}>×</button>
            </li>
          );
        })}
      </ol>
      {totals && (
        <div className="pick-totals">
          <div className="kicker">What these {words(field.pick).toLowerCase()} can buy you</div>
          {picked.length === 0
            ? <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>Pick a {field.noun ?? 'card'} and the totals show up here, so you can see what this game will be about before it starts.</div>
            : (
              <>
                <div className="chips">{totals.chips.map((c) => <span key={c} className="fx-chip">{c}</span>)}</div>
                {totals.note && <div className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>{totals.note}</div>}
              </>
            )}
        </div>
      )}
    </div>
  );
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function words(n: number): string {
  const w = SMALL[n];
  return w ? w[0]!.toUpperCase() + w.slice(1) : String(n);
}
