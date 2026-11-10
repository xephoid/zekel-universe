# Staging on Render

Staging is described by [`render.yaml`](../render.yaml), a Render Blueprint.
Applying it creates three things:

| Name | Render type | What it is |
| --- | --- | --- |
| `universe-staging` | web service (Docker, `infra/server.Dockerfile`) | The public site: API, sockets and the built web app. Health check `/healthz`. |
| `zekel-engine-staging` | private service (Docker, `Dockerfile` in `xephoid/zekel-games`) | The games engine. Reachable only on Render's private network. Sessions in SQLite on a 1 GB disk at `/var/data`. |
| `universe-staging-db` | Postgres | Universe's database. No outside connections. |

Nothing deploys by itself: both services have `autoDeployTrigger: off`
while CI is turned off. Deploy by hand from the dashboard.

## Before you start

1. A Render workspace whose GitHub app can read both `xephoid/zekel-universe`
   and `xephoid/zekel-games`.
2. The engine's Dockerfile on `main` in `zekel-games`. It is on the
   `claude/render-staging` branch there (commit `e191ad1`) until that pull
   request is merged. The Blueprint builds the engine from `main`.
3. This repository's `main` carrying `render.yaml`, `/healthz` and
   `CLIENT_IP_HEADER` support.
4. A Resend account with a verified sending domain. Without
   `RESEND_API_KEY` the server writes sign-in links to its log (SEC-14-F26),
   which must not happen on a public site.

## Steps

1. In Render, choose **New → Blueprint**, pick `xephoid/zekel-universe`, branch
   `main`. Render reads `render.yaml` and lists the three resources.
2. Render asks for the values marked `sync: false`. Type them into Render
   only, never into a file:
   - `APP_ORIGIN`: the web service's https address, for example
     `https://universe-staging.onrender.com` (no trailing slash). If the name
     is taken, Render adds a suffix; use the address Render shows, and
     update this value after the first deploy if it differs.
   - `RESEND_API_KEY`: the Resend key.
   - `EMAIL_FROM`: an address on the verified domain.
3. Apply. Render generates `SECRET_KEY` and the engine's `MCP_BEARER_TOKEN`,
   and copies the token into Universe's `ENGINE_TOKEN`. Nobody needs to see
   either value.
4. Deploy `zekel-engine-staging` first, then `universe-staging`.

Set by the Blueprint, no action needed: `NODE_ENV=production`, `PORT`,
`DATABASE_URL` (from the database), `ENGINE_HOSTPORT` (the engine's private
address; the server calls `http://<host:port>/mcp`), and
`CLIENT_IP_HEADER=cf-connecting-ip`.

## Checks after the first deploy

- `https://<site>/healthz` answers `{"ok":true}`.
- The engine's deploy log shows `session store: sqlite (/var/data/sessions.db)`
  and `auth=on`.
- The site's log shows the game catalog loaded from the engine, and no
  sign-in link text.
- Sign in by email link in one browser; opening the same link in a second
  browser is refused (SEC-03-F11).
- Two visitors on different networks each get their own guest budget
  (SEC-16-F13). Record this in the security review: it rests on Render's
  statement that all traffic reaches the service through Cloudflare, which
  overwrites `CF-Connecting-IP`.

## Limits of this setup

- The engine runs one instance: a disk rules out scaling, and only one
  process may use the SQLite file. A disk also means each engine deploy
  stops the old instance before starting the new one.
- `X-Forwarded-For` is never read. The server refuses to start if
  `CLIENT_IP_HEADER` names it.
- Plan names follow Render's published Blueprint schema (`starter` for
  services, `0.1c-256mb` for Postgres). Render's docs page also lists newer
  service plan names; if Render rejects `starter`, pick the equivalent plan
  when applying.
