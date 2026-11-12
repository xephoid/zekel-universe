// The designers' place: a profile per designer as the canvas draws it
// (avatar, name with the Designer badge, bio, counts, the games as a shelf,
// the updates as a devlog), and the list page the navigation points at.
// Publishing a game here is later work; the brief leaves it a place in the
// navigation and no more.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DesignerResponse, DesignersResponse } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { Nav } from './Nav';
import { DevlogItem } from './Home';
import { Avatar, Cover, playersLabel } from '../ui';

/** A designer's portrait when the admin page has one, else the initial. */
export function DesignerAvatar({ name, image, size }: { name: string; image: string | null; size: number }) {
  if (image) return <img src={image} alt="" className="avatar" style={{ width: size, height: size, objectFit: 'cover' }} />;
  return <Avatar name={name} size={size} style={size > 60 ? { fontSize: 44, fontFamily: 'var(--font-display)', fontWeight: 700, borderWidth: 3 } : undefined} />;
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function DesignersPage() {
  const [list, setList] = useState<DesignersResponse['designers'] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.designers().then((r) => setList(r.designers)).catch((e) => setErr((e as Error).message));
  }, []);
  return (
    <div>
      <Nav />
      <div className="page narrow stack loose">
        <div>
          <h1>Designers</h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>The people whose games are on the table here.</p>
        </div>
        {err && <p className="error">{err}</p>}
        {list === null && !err && <p className="muted">Loading…</p>}
        {list?.map((d) => (
          <Link key={d.slug} to={`/designers/${d.slug}`} className="card person-row" style={{ padding: '14px 18px', textDecoration: 'none', color: 'inherit', borderTop: 'none' }}>
            <DesignerAvatar name={d.name} image={d.avatarImage} size={40} />
            <div className="grow">
              <div className="name" style={{ fontSize: 15 }}>{d.name}</div>
              <div className="sub">{COUNT_WORDS[d.gameCount] ?? d.gameCount} game{d.gameCount === 1 ? '' : 's'}, all on the open zekel engine</div>
            </div>
            <span className="badge green">Designer</span>
          </Link>
        ))}
        <section>
          <h2 style={{ fontSize: 22 }}>Publishing your own game</h2>
          <p className="muted" style={{ lineHeight: 1.5 }}>A game runs here once it runs on the open zekel engine. Uploading and testing a game from this site is coming; for now the engine's repository is the door.</p>
        </section>
      </div>
    </div>
  );
}

export function DesignerPage() {
  const { slug = '' } = useParams();
  const [data, setData] = useState<DesignerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.designer(slug).then(setData).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
  }, [slug]);

  if (err) return (<div><Nav /><div className="page"><p className="error">{err}</p></div></div>);
  if (!data) return (<div><Nav /><div className="page"><p className="muted">Loading…</p></div></div>);

  return (
    <div>
      <Nav />
      <div className="page stack loose" style={{ paddingTop: 28 }}>
        <Link to="/designers" className="crumb">‹ Designers</Link>
        <div className="profile-head">
          <DesignerAvatar name={data.designer.name} image={data.designer.avatarImage} size={112} />
          <div className="stack" style={{ gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1>{data.designer.name}</h1>
              <span className="badge green">Designer</span>
            </div>
            <p className="bio">{data.designer.bio}</p>
            <div className="stats">
              <span><b>{data.games.length}</b> game{data.games.length === 1 ? '' : 's'}</span>
              <span><b>{data.updates.length}</b> update{data.updates.length === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
        <section>
          <div className="row-head"><h2 style={{ fontSize: 22 }}>Games</h2></div>
          <div className="shelf newest-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {data.games.map((g) => (
              <Link key={g.engineGameId} to={`/games/${g.engineGameId}`} className="card shelf-card">
                <Cover game={g} size="small" />
                <div className="body">
                  <div className="card-title" style={{ fontSize: 18 }}>{g.name}</div>
                  <div className="muted card-sub">{playersLabel(g.playerCount)}{g.playTime ? ` · ${g.playTime}` : ''}</div>
                  {g.description && <div className="card-blurb">{g.description}</div>}
                  <div className="go">Play now ›</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <div className="devlog">
          <h2>Updates</h2>
          {data.updates.length === 0 ? <p className="muted">No updates yet.</p> : data.updates.map((u) => <DevlogItem key={u.id} u={u} />)}
        </div>
      </div>
    </div>
  );
}
