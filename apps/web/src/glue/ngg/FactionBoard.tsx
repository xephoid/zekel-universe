// A seat's faction board: folded into a strip under the table, and opened
// whole in a sheet. A wizard's is a page somebody wrote on (Ink), a robot's a
// part somebody machined (Oil); the difference is only the theme around it.
// Everything comes from the viewing seat's own view: public counts, the
// printed catalogue, and, on the seat's own board only, the private keys
// (hand, spy) only this seat receives. Another seat's board shows its hand as
// card backs.

import type { ScreenCtx } from './ctx';
import { coresOf, econOf, type NggPlayer } from './read';
import type { RefUnit } from './ref';
import { inkOf } from './factions';
import { CardBack, CostChips, FactionChip, Icon, Panel } from './ui';

const ACTION_CARDS: Array<{ key: string; played: string; name: string; icon: string }> = [
  { key: 'build', played: 'build', name: 'Build', icon: 'Build' },
  { key: 'moveBattle', played: 'move_battle', name: 'Move / Battle', icon: 'Move / Battle' },
  { key: 'research', played: 'research', name: 'Research', icon: 'Research' },
];

function Pips({ have, max, cap }: { have: number; max: number; cap: number }) {
  return (
    <span className="ngg-pips" aria-label={`${have} of ${max}`}>
      {Array.from({ length: cap }, (_, i) => (
        <i key={i} className={i < have ? 'on' : i < max ? 'room' : 'none'} />
      ))}
    </span>
  );
}

function Numbers({ p, need }: { p: NggPlayer; need: number | null }) {
  const cores = coresOf(p);
  const econ = econOf(p);
  const of = need ? <small>/{need}</small> : null;
  return (
    <div className="ngg-numbers">
      <span className="ngg-number"><i>CULTURE</i><b>{p.culture}</b></span>
      <span className="ngg-number"><i>TECH</i><b>{p.tech.total}{p.tech.target !== null ? <small>/{p.tech.target}</small> : null}</b></span>
      {p.species === 'robot'
        ? (
          <>
            <span className="ngg-number"><i>CORES FREE</i><b>{cores.free}</b></span>
            <span className="ngg-number"><i>CORES USED</i><b>{cores.used}</b></span>
            <span className="ngg-number" title="Collectors owned, against the Economic victory's count"><i>COLLECTORS</i><b>{econ ? econ.owned : '—'}{of}</b></span>
          </>
        )
        : (
          <>
            <span className="ngg-number"><i>MANA</i><b>{p.manaCurrent}<small>/{p.manaMax}</small></b></span>
            <span className="ngg-number" title="Surfs owned, against the Economic victory's count"><i>SURFS</i><b>{econ ? econ.owned : '—'}{of}</b></span>
            <span className="ngg-number"><i>SUBJECTS</i><b>{p.subjects}</b></span>
          </>
        )}
    </div>
  );
}

/** How many of a unit type the seat owns: collectors by type, Subjects and
 *  Cores off the map, every other unit on the map. */
function ownedCount(p: NggPlayer, u: RefUnit): number | null {
  if (u.collector) return p.ownedCollectors ? p.ownedCollectors.filter((c) => c.type === u.name).length : null;
  if (u.id === 'subject') return p.subjects;
  if (u.id === 'core') { const c = coresOf(p); return c.used + c.free; }
  return p.units.filter((x) => x.type === u.name).length;
}

function ownedNote(p: NggPlayer, u: RefUnit): string {
  if (u.collector) {
    if (!p.ownedCollectors) return `${p.collectors.filter((c) => c.id && collectorType(p, c.resource) === u.name).length} on the map · up to ${u.maxPerPlayer}`;
    const mine = p.ownedCollectors.filter((c) => c.type === u.name);
    const placed = mine.filter((c) => c.placedAt).length;
    const unpowered = mine.filter((c) => c.core === 'CORELESS').length;
    return [`${placed} on the map`, unpowered ? `${unpowered} without a Core` : null, `up to ${u.maxPerPlayer}`].filter(Boolean).join(' · ');
  }
  if (u.id === 'subject') return 'on the faction board';
  if (u.id === 'core') { const c = coresOf(p); return `${c.used} fitted · ${c.free} spare`; }
  return `on the map · up to ${u.maxPerPlayer}`;
}

/** A placed collector's type: a wizard's is a Surf, a robot's names its resource. */
function collectorType(p: NggPlayer, resource: string | null): string {
  if (p.species === 'wizard') return 'Surf';
  return resource ? `${resource[0]!.toUpperCase()}${resource.slice(1)} collector` : '';
}

function ActionCards({ p }: { p: NggPlayer }) {
  // Another seat's planned cards are face down: only how many is known.
  if (p.actionCardsPlayed === null) {
    return (
      <div className="ngg-action-cards">
        {ACTION_CARDS.map((c) => {
          const held = p.actionCards[c.key] ?? 0;
          return (
            <span key={c.key} className="ngg-action-card">
              <Icon name={c.icon} size={18} stroke={1.8} />
              <b>{c.name}</b>
              <i>{held} held</i>
            </span>
          );
        })}
        <span className="ngg-action-card facedown"><CardBack /><b>{p.actionCardsPlayedCount} played</b><i>face down</i></span>
      </div>
    );
  }
  const playedList = p.actionCardsPlayed;
  return (
    <div className="ngg-action-cards">
      {ACTION_CARDS.map((c) => {
        const held = p.actionCards[c.key] ?? 0;
        const played = playedList.filter((x) => x.startsWith(`${c.played}:`)).length;
        return (
          <span key={c.key} className={`ngg-action-card${played >= held && held > 0 ? ' used' : ''}`}>
            <Icon name={c.icon} size={18} stroke={1.8} />
            <b>{c.name}</b>
            <i>{held > 1 ? `${held - played} of ${held} in hand` : played > 0 ? 'on the stack' : 'in hand'}</i>
          </span>
        );
      })}
    </div>
  );
}

/** A unit, building or technology id, by its printed name. */
function nameOfType(ctx: ScreenCtx, id: string): string {
  const ref = ctx.ref;
  return ref?.units.find((u) => u.id === id)?.name
    ?? ref?.buildings.find((b) => b.id === id)?.name
    ?? ref?.research.find((r) => r.id === id)?.name
    ?? id;
}

export function FactionStrip({ ctx, player, onOpen }: { ctx: ScreenCtx; player: NggPlayer; onOpen: () => void }) {
  const ink = inkOf(player.faction);
  return (
    <div className={`ngg-strip seat-${player.species ?? 'wizard'}`} data-flip-id={`ngg-supply:${player.id}`}>
      <div className="ngg-strip-id">
        <span className="ngg-strip-mark" style={{ background: ink.fill, color: ink.on }}>{ink.mark && <Icon name={ink.mark} size={22} stroke={1.8} />}</span>
        <span><b>{player.faction ?? 'Your seat'}</b><i>you · {player.species ?? 'no faction yet'}</i></span>
      </div>
      <Numbers p={player} need={ctx.ref?.economicCollectors ?? null} />
      <ActionCards p={player} />
      <div className="ngg-strip-hand" title={`${player.handCount} battle card${player.handCount === 1 ? '' : 's'} in hand`}>
        {ctx.v.hand.length > 0
          ? ctx.v.hand.map((c, i) => <span key={i} className="ngg-mini-card" title={c.effect}>{c.card}</span>)
          : <span className="muted">No battle cards</span>}
      </div>
      <button type="button" className="ngg-btn secondary" onClick={onOpen}>Open board</button>
    </div>
  );
}

export function FactionBoard({ ctx, player }: { ctx: ScreenCtx; player: NggPlayer }) {
  const { ref, v } = ctx;
  // The hand and the spy are private: only the seat's own board shows them.
  const own = player.id === ctx.me;
  const ink = inkOf(player.faction);
  const species = player.species ?? 'wizard';
  const buildings = (ref?.buildings ?? []).filter((b) => b.species === species);
  const research = (ref?.research ?? []).filter((r) => r.species === species);
  const units = (ref?.units ?? []).filter((u) => u.species === species);
  const treaties = v.treaties.filter((t) => t.partners.includes(player.id));
  const spy = own ? v.spies.find((s) => s.active) ?? null : null;
  return (
    <div className={`ngg-faction-board seat-${species}`}>
      <span className="ngg-ground" aria-hidden="true" />
      <header className="ngg-fb-head">
        <span className="ngg-fb-mark" style={{ background: ink.fill, color: ink.on }}>{ink.mark && <Icon name={ink.mark} size={34} stroke={1.8} />}</span>
        <div>
          <div className="ngg-kicker">Faction board</div>
          <h2>{player.faction ?? (own ? 'Your seat' : ctx.seat(player.id))}</h2>
          <span className="ngg-tagchip">{species}</span>
        </div>
        <Numbers p={player} need={ctx.ref?.economicCollectors ?? null} />
      </header>

      {species === 'wizard'
        ? (
          <Panel title="Mana" kicker={`${player.manaCurrent} of ${player.manaMax}`}>
            <Pips have={player.manaCurrent} max={player.manaMax} cap={25} />
          </Panel>
        )
        : (
          <Panel title="Core bay">
            <div className="ngg-core-bay">
              <span><i>FITTED</i><b>{player.units.filter((u) => u.core === 'allocated').length}</b></span>
              <span className="hl"><i>SPARE</i><b>{player.coresReserve}</b></span>
              <span className="dashed"><i>UNPURCHASED</i><b>{player.coresSupply}</b></span>
            </div>
          </Panel>
        )}

      <Panel title="Technology" kicker={`${player.tech.total}${player.tech.target !== null ? ` of ${player.tech.target}` : ''} unique types`}>
        <Pips have={player.tech.total} max={player.tech.target ?? player.tech.total} cap={player.tech.target ?? player.tech.total} />
        {player.tech.acquiredTypes.length > 0 && (
          <p className="ngg-fb-note">{player.tech.acquiredTypes.map((id) => nameOfType(ctx, id)).join(' · ')}</p>
        )}
      </Panel>

      <div className="ngg-fb-grid">
        <Panel title="Buildings">
          <ul className="ngg-fb-list">
            {buildings.map((b) => {
              // A base is counted on the map, not among the buildings.
              const n = b.isBase ? player.bases.length : player.buildingCounts[b.id] ?? (player.buildings.includes(b.name) ? 1 : 0);
              return (
                <li key={b.id} className={n > 0 ? 'on' : 'off'}>
                  <span className="ngg-fb-list-mark"><Icon name={b.name} size={20} stroke={1.8} /></span>
                  <span><b>{b.name}</b>{n > 1 ? ` ×${n}` : ''}<i>{b.effect}</i></span>
                  <span className="ngg-fb-state">{n > 0 ? 'BUILT' : <CostChips cost={b.cost} />}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Research">
          <ul className="ngg-fb-list">
            {research.map((r) => {
              const on = player.research.includes(r.name) || player.research.includes(r.id);
              return (
                <li key={r.id} className={on ? 'on' : 'off'}>
                  <span className="ngg-fb-list-mark"><Icon name={r.name} size={20} stroke={1.8} /></span>
                  <span><b>{r.name}</b><i>{r.effect}</i><i>Needs {r.prerequisite}</i></span>
                  <span className="ngg-fb-state">{on ? 'RESEARCHED' : <CostChips cost={r.cost} />}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Units">
        <div className="ngg-fb-units">
          {units.map((u) => {
            const owned = ownedCount(player, u);
            return (
              <div key={u.id} className={`ngg-fb-unit${owned ? ' owned' : ''}`}>
                <span className="ngg-fb-count" aria-label={owned === null ? 'count not published' : `${owned} owned`}>×{owned ?? '—'}</span>
                <span className="ngg-fb-list-mark"><Icon name={u.name} size={22} stroke={1.8} /></span>
                <b>{u.name}</b>
                {u.init !== null && (
                  <span className="ngg-statline">
                    <span><i>INIT</i>{u.init}</span><span><i>DMG</i>{u.dmg ?? '—'}</span><span><i>DEF</i>{u.def ?? '—'}</span>
                  </span>
                )}
                <CostChips cost={u.cost} />
                <i>{ownedNote(player, u)}</i>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="ngg-fb-grid">
        <Panel title="Heroes">
          <ul className="ngg-fb-heroes">
            {player.heroes.length === 0 && <li className="muted">None yet</li>}
            {player.heroes.map((h) => (
              <li key={h.name} className={`${h.leader ? 'leader' : ''}${h.dead ? ' dead' : ''}${spy?.hero === h.name ? ' spy' : ''}`}>
                <span className="ngg-avatar" style={{ background: ink.fill, color: ink.on }}>{h.name.split(/\s+/).map((w) => w[0]).slice(-2).join('')}</span>
                <span><b>{h.name}</b><i>{h.dead ? 'Killed' : h.stats ?? ''}{h.coord === null && !h.dead ? ' · reserved' : ''}</i></span>
                <span className="ngg-fb-state">{h.leader ? 'LEADER' : spy?.hero === h.name ? 'SPY' : ''}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Battle cards" kicker={`${player.handCount} held · ${v.deckCount} in the deck`}>
          <div className="ngg-fb-hand">
            {own && v.hand.length > 0
              ? v.hand.map((c, i) => (
                  <div key={i} className="ngg-fb-card"><b>{c.card}</b><i>{c.effect}</i></div>
                ))
              : Array.from({ length: player.handCount }, (_, i) => <CardBack key={i} />)}
            {player.handCount === 0 && <span className="muted">None held</span>}
          </div>
        </Panel>
        <Panel title="Treaties">
          <ul className="ngg-fb-list">
            {(ref?.treaties ?? []).map((t) => {
              const held = treaties.find((x) => x.name === t.name);
              const partner = held ? held.partners.find((x) => x !== player.id) ?? null : null;
              return (
                <li key={t.id} className={held ? 'on' : 'off'}>
                  <span className="ngg-fb-list-mark"><Icon name={t.name} size={20} stroke={1.8} /></span>
                  <span><b>{t.name}</b><i>{held ? `with ${ctx.seat(partner)}` : 'free'} · +{t.cultureIncome} culture</i></span>
                  {held && <FactionChip faction={v.players.find((p) => p.id === partner)?.faction ?? null} size={20} />}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Action cards"><ActionCards p={player} /></Panel>
    </div>
  );
}
