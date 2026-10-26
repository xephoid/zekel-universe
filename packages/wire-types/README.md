# @zekel/wire-types

The three shapes the Zekel Universe server sends a game's drawing code about
the game itself:

- `LegalMove`: a move as the zekel engine lists it, with its id, description,
  price and, for a game whose moves move pieces, where the piece lands.
- `UnavailableMove`: a move the engine says this seat cannot take right now,
  and the engine's reason.
- `GameReferenceResponse`: what the engine publishes about a game: its rules
  text, its reference data (card catalogs, caps, thresholds) and the shapes
  its moves and options take.

A game's drawing code reads every number from these, never from a constant of
its own. The website's own types (people, tables, events) are not here.

Part of [Zekel Universe](https://github.com/xephoid/zekel-universe), the web
client for the zekel board-game engine. Apache 2.0.
