# @zekel/glue-kit

The rules every zekel game's drawing code follows. A game's "glue" maps the
seat's view (JSON from the engine) onto a tree of primitives, and the engine's
legal moves onto the parts a player may touch. A glue never decides rules; it
draws what the engine said and reads every number from the view or from the
game's reference data.

What is here:

- `GlueModule`, `GlueInput`, `TablePlan`, `Zone`: what a glue is and what it
  returns. A game whose table is more than the bench layout can hold supplies
  a `Screen`, and a game with a scripted beat (a strike) supplies a
  `momentFor` and a `Moment` overlay of its own.
- The setup fields a game asks before the table opens (`SetupField`).
- Player agency: `submitMove` and the five triggers that may ever send a move
  (a tap, the Roll or Draw button, an undo, a form the person filled in, a
  batch the person pressed once). Nothing else submits.
- Template forms (`MoveForm`, `templateForm`, `formForMove`): the questions a
  move with blanks asks, with nothing preselected.
- Card identity across views (`trackIdentities`), so a card flies from where
  it was instead of appearing where it is.
- `ZoneRenderer`, `BoardZones`, `JsonInspector`: a zone onto its primitive.

Needs `react` 18. Depends on `@zekel/primitives` and `@zekel/wire-types`.

Part of [Zekel Universe](https://github.com/xephoid/zekel-universe), the web
client for the zekel board-game engine. Apache 2.0.
