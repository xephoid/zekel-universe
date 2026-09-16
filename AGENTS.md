# AGENTS.md

This file provides guidance to AI coding agents working in this repository. It is kept identical to CLAUDE.md apart from this line; edit both together.

## This is an open-source project, and this file is public

Everything committed here is published under Apache 2.0 at a public GitHub repository. Treat every file, commit message, and comment as something a stranger will read.

- **Never commit API keys, access tokens, passwords, or any other secret.** Not in code, config, tests, fixtures, docs, commit messages, or example files. Secrets live only in environment variables (Heroku config vars in production, an untracked `.env` locally). The repository may carry a `.env.example` listing variable names with empty or obviously fake values, nothing more. If a secret is ever committed, treat it as leaked: rotate it first, then remove it from history.
- **No private information.** No personal names beyond public authorship, no email addresses, no local machine paths, no links to private tools or private documents, nothing about unpublished work.
- **Nothing we don't have the right to publish.** Only content this project owns or that carries a license compatible with Apache 2.0 goes in. The four games referenced here (Fractured Fist, Cybernoir 2127, Warble Way Galaxy, Sweetlands Imperium) are Zekel Games' own designs and may be documented, drawn, and quoted. Do not add rulebook text, card data, art, or code from any other game. Third-party libraries and fonts must have compatible licenses and be credited in an ATTRIBUTIONS file when one is warranted.
- **When in doubt, leave it out** and ask.

## Write in plain words

Everyday words, short sentences, answer first. Never coin a label mid-conversation and then lean on it as if it were an established term; say the plain thing every time. Real names of files, tools, and games are fine.

## What this repository is

Zekel Universe is the web and voice client for the zekel board-game engine, a separate open-source project. Players play in the browser against AI opponents or with friends, and independent game designers share their games here. The engine decides every rule; Universe draws the table, moves the pieces, and talks to the player. **Universe never imports game code and never holds a second copy of a rule.**

There is no application code yet. Commands today are git only. When code lands, the decided stack is one pnpm workspace: a Node backend (API + websockets, the engine's only client), a React + Vite + TypeScript frontend, shared types, and a design-tokens package; Postgres in production, SQLite locally; passwordless sign-in; guest play against AI with no account.

## Where the decisions live

- `docs/design-brief.md` — the product and design brief. Every decision so far is recorded here, marked **DECIDED** or **CONFIRMED**. Read it before proposing UX or architecture; do not re-open settled decisions (bench layout, no following in v1, guests may join but not host, continuous AI slideshow, phone as a later pass, warm-but-flat look).
- `docs/implementation-plan.md` — the build plan: code layout, data model, how a move flows, milestones M0–M7 with acceptance checks. Work in milestone order; a milestone is done when its check passes.
- `docs/games/<game>.md` — a designer's reference per game: every component, count, color, turn step, hidden zone, and moment to animate, with the engine as source of truth over the rulebook. Page images sit beside each. Cite these rather than re-deriving game facts.
- `docs/brand/wordmark.html` — the only brand mark: the word "zekel" with the k drawn as an all-orange meeple on its back.

## Regular security checks

Follow [security-check-playbook.md](security-check-playbook.md) during development.
Before finishing an application, test, dependency, configuration, or infrastructure
change, run its change-mode checks and relevant security regressions. For a
documentation-only change, check disclosure, links, and any security instruction
changes. Run a full review at the first development session of each active calendar
week and before accepting a milestone; use release mode before public deployment
or changes to authentication providers, credentials, or production infrastructure.
Check the latest report in `docs/security-reviews/` to determine when a full review
is due. Record evidence and blocked or untested checks; never turn missing evidence
into a pass. Keep all reports free of secrets and private data. These are development
checks, not authorization to probe production or contact real users.

## Rules that keep getting broken

- **Player agency.** A decision the printed rules give to the player is never made by the server, the interface, or a convenience default, not even to smooth a flow. Randomness (dice, hidden draws) may be server-resolved for digital seats but only when the person presses a Roll or Draw button, never silently. When you design or review a flow, check each auto-resolved step: is it randomness or a choice?
- **Nothing appears in place.** Cards fly from a pile to a zone, pieces slide along their path, tokens drop. A fade-in is a bug in the motion language.
- **The eight primitives are the unit of implementation**, not screens: card, card zone, tableau, bag, track, pool, grid, map. Universe's versions take the same data fields as the engine's web component library (CardData, CardZoneData, and so on) so a board description works in both places. Parts carry color keys; games supply palettes.

## The design canvas

The visual design is a design canvas whose working files are the source of truth and live in `docs/design/`:

- `Main.dc.html` (overview with the designer's captions), `Zekel Pages.dc.html` (home → game → setup → lobby → profile → sign-in → end → listen mode), `Sweetlands Table.dc.html` (the interactive table prototype), `Primitives.dc.html` (the component sheet), `Sweetlands Art.dc.html` (faction portraits and treat icons), `canvas.json` (layout), `assets/` (images, each kept under ~70 KB).
- To change the design: edit these files, then use the `design` skill to reassemble and republish. Never hand-edit an assembled output file; always rebuild from the working files. Keep the artboard names as they are; the `dc-import` tags reference them.
- Game content in the draft (four kingdoms, invented abilities, the Warble Way crew) is placeholder by choice; a fidelity pass against `docs/games/` comes later.
