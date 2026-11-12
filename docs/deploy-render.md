# Production on Render

Render is for production only. Staging is the existing ngrok deployment;
there is no Render staging environment, and none should be created.

Create the production setup on Render only at launch, once the staging,
browser, security and database checks have passed on the ngrok staging
deployment. Until then nothing in this guide is applied.

Production is described by [`render.yaml`](../render.yaml), a Render
Blueprint. Applying it creates three things:

| Name | Render type | What it is |
| --- | --- | --- |
| `universe-production` | web service (Docker, `infra/server.Dockerfile`) | The public site: API, sockets and the built web app. Health check `/healthz`. |
| `zekel-engine-production` | private service (Docker, `Dockerfile` in `xephoid/zekel-games`) | The games engine. Reachable only on Render's private network. Sessions in SQLite on a 1 GB disk at `/var/data`. |
| `universe-production-db` | Postgres | Universe's database. No outside connections. |

Nothing deploys by itself: both services have `autoDeployTrigger: off`
while CI is turned off. Deploy by hand from the dashboard.

## Before you start

1. The launch checks passed on the ngrok staging deployment: browser
   sign-in and play, the security release review, and Postgres. Basic
   reachability of staging is not enough.
2. A Render workspace whose GitHub app can read both `xephoid/zekel-universe`
   and `xephoid/zekel-games`.
3. The engine's Dockerfile on `main` in `zekel-games`. It is on the
   `claude/render-staging` branch there (commit `e191ad1`) until that pull
   request is merged. The Blueprint builds the engine from `main`.
4. This repository's `main` carrying `render.yaml`, `/healthz` and
   `CLIENT_IP_HEADER` support.
5. A Resend account with a verified sending domain. Without
   `RESEND_API_KEY` the server writes sign-in links to its log (SEC-14-F26),
   which must not happen in production.

## Steps

1. In Render, choose **New → Blueprint**, pick `xephoid/zekel-universe`, branch
   `main`. Render reads `render.yaml` and lists the three resources.
2. Render asks for the values marked `sync: false`. Type them into Render
   only, never into a file:
   - `APP_ORIGIN`: the web service's https address, for example
     `https://universe-production.onrender.com`, or the launch domain once it
     points at the service (no trailing slash). If the name
     is taken, Render adds a suffix; use the address Render shows, and
     update this value after the first deploy if it differs.
   - `RESEND_API_KEY`: the Resend key.
   - `EMAIL_FROM`: an address on the verified domain.
   - `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: the Supabase project's
     address and publishable key, for sign-in with Discord and Google. Leave
     both empty to offer only the email link. Setting up the project, the
     Discord app and the Google client: `docs/auth-supabase-plan.md`.
   - `POSTHOG_KEY`: the PostHog project key (`phc_...`) for site analytics.
     Leave it empty to keep analytics off. Optional `POSTHOG_HOST` defaults
     to `https://us.i.posthog.com`.
3. Apply. Render generates `SECRET_KEY` and the engine's `MCP_BEARER_TOKEN`,
   and copies the token into Universe's `ENGINE_TOKEN`. Nobody needs to see
   either value.
4. Deploy `zekel-engine-production` first, then `universe-production`.

Set by the Blueprint, no action needed: `NODE_ENV=production`, `PORT`,
`DATABASE_URL` (from the database), `ENGINE_HOSTPORT` (the engine's private
address; the server calls `http://<host:port>/mcp`), and
`CLIENT_IP_HEADER=cf-connecting-ip`.

## Checks after the first production deploy

Run these against production (`<site>` below is the host in
`APP_ORIGIN`). Passing them on staging earlier does not replace them.

- `https://<site>/healthz` answers `{"ok":true}`.
- The engine's deploy log shows `session store: sqlite (/var/data/sessions.db)`
  and `auth=on`.
- The site's log shows the game catalog loaded from the engine, and no
  sign-in link text.
- Sign in by email link in one browser; opening the same link in a second
  browser is refused (SEC-03-F11).
- When Supabase is set: sign in with Discord and with Google. Each lands back
  signed in; the sign-in page's address bar holds no code afterwards.
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
