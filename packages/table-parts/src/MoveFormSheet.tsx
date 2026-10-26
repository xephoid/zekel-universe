// A template move's questions, in a sheet. Nothing is preselected; the move
// is built from the person's answers and sent only when they press Send
// (see the agency rules in @zekel/glue-kit).

import { useState } from 'react';
import type { MoveForm } from '@zekel/glue-kit';
import { Sheet } from './Sheet.js';

/** A template move's questions. The Send button is live only once every
 *  answer is in; the answers start empty, whatever the template held. */
export function MoveFormSheet({ form, onSend, onClose, disabled }: {
  form: MoveForm; onSend: (move: Record<string, unknown>) => void; onClose: () => void; disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const built = form.build(answers);
  const set = (key: string, value: unknown) => setAnswers((a) => ({ ...a, [key]: value }));
  const toggle = (key: string, value: string, pick: number) => setAnswers((a) => {
    const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
    if (cur.includes(value)) return { ...a, [key]: cur.filter((x) => x !== value) };
    if (cur.length >= pick) return a;
    return { ...a, [key]: [...cur, value] };
  });
  return (
    <Sheet title={form.title} onClose={onClose}>
      {form.help && <p className="muted form-help">{form.help}</p>}
      <form className="move-form" onSubmit={(e) => { e.preventDefault(); if (built) onSend(built); }}>
        {(form.fieldsFor?.(answers) ?? form.fields).map((f) => {
          if (f.kind === 'text') {
            return (
              <label key={f.key} className="field">
                <span className="label">{f.label}</span>
                <input type="text" maxLength={f.maxLength} placeholder={f.placeholder} value={typeof answers[f.key] === 'string' ? (answers[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value)} />
                {f.help && <span className="muted">{f.help}</span>}
              </label>
            );
          }
          if (f.kind === 'number') {
            return (
              <label key={f.key} className="field">
                <span className="label">{f.label}</span>
                <input type="number" min={f.min} max={f.max} value={typeof answers[f.key] === 'string' ? (answers[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value)} />
                {f.help && <span className="muted">{f.help}</span>}
              </label>
            );
          }
          if (f.kind === 'choice') {
            return (
              <fieldset key={f.key} className="field">
                <legend className="label">{f.label}</legend>
                <div className="radio-row">
                  {f.options.map((o) => (
                    <label key={o.value} title={o.hint}>
                      <input type="radio" name={f.key} aria-label={o.label} checked={answers[f.key] === o.value} onChange={() => set(f.key, o.value)} /> {o.label}
                    </label>
                  ))}
                </div>
                {f.help && <span className="muted">{f.help}</span>}
              </fieldset>
            );
          }
          const picked = Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : [];
          return (
            <fieldset key={f.key} className="field">
              <legend className="label">{f.label} ({picked.length} of {f.pick})</legend>
              <div className="radio-row">
                {f.options.map((o) => (
                  <label key={o.value} title={o.hint}>
                    <input type="checkbox" aria-label={o.label} checked={picked.includes(o.value)} onChange={() => toggle(f.key, o.value, f.pick)} /> {o.label}
                  </label>
                ))}
              </div>
              {f.help && <span className="muted">{f.help}</span>}
            </fieldset>
          );
        })}
        {form.summarize?.(answers) && <p className="form-total">{form.summarize(answers)}</p>}
        <button className="btn" type="submit" disabled={disabled || !built}>{form.submitLabel ?? 'Send'}</button>
      </form>
    </Sheet>
  );
}
