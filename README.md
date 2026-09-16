# Zekel Universe

A website where people play board games in the browser against AI opponents or with friends, and where independent game designers share their games so people will play them.

The games are run by a separate rules engine, zekel. Universe draws the table, moves the pieces, and talks to the player. It never decides a rule.

## Getting started (v0)

The code lives in one pnpm workspace. To work on the packages:

```sh
pnpm install     # install dependencies
pnpm dev         # run the app dev servers (web + server)
```

To run the full stack (engine + server + web build) in Docker, clone the
zekel engine repo next to this one, then:

```sh
cp .env.example .env                       # fill in tokens; any random strings work locally
docker compose -f infra/docker-compose.yml up --build
```

- Engine (the zekel rules engine): http://localhost:8787, health at `/healthz`
- Server (site and API): http://localhost:8788

The engine image builds from `../zekel` — see `infra/docker-compose.yml` for
the layout it expects, and `infra/` for everything else about running it.

## Design documents

This repository also holds the design work:

- `docs/design-brief.md` — the design brief and the decisions made so far
- `docs/games/` — a designer's reference for each of the first four games
- `docs/design/` — the design canvas working files
- `docs/brand/` — the wordmark

Licensed under Apache 2.0. See `LICENSE`.
