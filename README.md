# Zekel Universe

A website where people play board games in the browser against AI opponents or with friends, and where independent game designers share their games so people will play them.

The games are run by a separate rules engine, zekel. Universe draws the table, moves the pieces, and talks to the player. It never decides a rule.

## What works today (v0, milestones M0 and M1)

A guest opens a game page, presses Play now, makes the game's own setup
choices, and plays a complete game of Fractured Fist against the AI in the
browser: legal moves light up the parts they touch, the numbered move menu is
always there as a fallback, AI turns play back as a paced slideshow with
replay and undo, rules lessons appear the first time a rule matters, and the
end screen shows the result over the final table. Sign-in by email link,
lobbies for tables with friends, and live two-human play work on the server
and in the browser but have not yet had their own browser-driven acceptance
pass. See [the implementation plan](docs/implementation-plan.md) for the
milestones and [the implementation issues](implementation-issues.md) for the
review that drove this pass.

## Getting started

The code is one pnpm workspace: `apps/server` (the API and websockets, the
engine's only client), `apps/web` (React + Vite), and `packages/` (shared
wire types, the engine client, the eight primitives, the design tokens).

You need Node 22 or newer, pnpm 10, and a checkout of the zekel engine next
to this repository:

```text
code/
  zekel/            <- the engine (build it: pnpm install && pnpm build)
  zekel-universe/   <- this repo
```

Run the engine in HTTP mode with its SQLite session store from the engine
checkout (pick any long random string as the token):

```sh
SESSION_STORE=sqlite MCP_TRANSPORT=http PORT=8787 MCP_BEARER_TOKEN=<token> node dist/index.js
```

Then, in this repository:

```sh
pnpm install
cp .env.example .env     # set ENGINE_TOKEN to the same token; any random SECRET_KEY
pnpm dev                 # builds the packages, then runs the server and the web app
```

Open http://localhost:5173. The server listens on the `PORT` from `.env`
(8788 by default) with a local SQLite file, prints sign-in links to its log
instead of emailing them, and the Vite dev server proxies `/api` and the
socket to it. The primitives gallery is at `/gallery`.

Useful commands:

```sh
pnpm typecheck           # every package
pnpm test                # unit and integration tests against a scripted fake engine
pnpm build               # packages, the server, and the web app
pnpm start               # the built server, which also serves the built web app
pnpm test:e2e            # a full browser game against a running server (BASE_URL, default :8788)
```

The engine-client contract tests run against a live engine when `ENGINE_URL`
and `ENGINE_TOKEN` are set; the Postgres schema test runs when
`TEST_DATABASE_URL` points at a Postgres database.

## The full stack in Docker

With the engine checkout beside this repository and Docker running:

```sh
cp .env.example .env     # fill in ENGINE_TOKEN, SECRET_KEY, POSTGRES_PASSWORD
docker compose -f infra/docker-compose.yml up --build
```

- Engine: http://localhost:8787, health at `/healthz`
- Server (site and API, production build, Postgres): http://localhost:8788

## Production

The server is a plain Node process (`node apps/server/dist/index.js`) that
serves the built web app and refuses to start without `SECRET_KEY`,
`ENGINE_TOKEN`, `ENGINE_URL`, `APP_ORIGIN`, and a Postgres `DATABASE_URL`.
Set `RESEND_API_KEY` to send sign-in links by email. A `Procfile` is included
for Heroku; the deployment decisions are in the implementation plan.

## Security during development

Use [the security check playbook](security-check-playbook.md) for checks on each
development change, weekly development reviews, milestone reviews, and release
checks. It gives an LLM concrete test procedures, expected outcomes, and a report
format. See [implementation issues](implementation-issues.md) for the initial
implementation review; recheck each finding against current code. Reports
live in `docs/security-reviews/`.

## Design documents

This repository also holds the design work:

- `docs/design-brief.md` — the design brief and the decisions made so far
- `docs/implementation-plan.md` — the build plan, milestones, and the decisions made while building
- `docs/games/` — a designer's reference for each of the first four games
- `docs/design/` — the design canvas working files
- `docs/brand/` — the wordmark

Licensed under Apache 2.0. See `LICENSE`.
