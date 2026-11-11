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
- The table furniture a game's own screen may draw: `Sheet` (the table's one
  dialog; it traps focus, closes on Escape or a tap outside, and hands focus
  back), `MoveFormSheet` (a template move's questions, sent only when the
  person presses Send) and `PaceControl` (the playback pace buttons). Their
  styles are `@zekel/glue-kit/css`; the colors come from `@zekel/tokens/css`,
  and the fields inside a move form take the host's own `.field`, `.label`,
  `.radio-row` and `.btn` styles.

```ts
import { Sheet, MoveFormSheet, PaceControl } from '@zekel/glue-kit';
import '@zekel/glue-kit/css';
```

Needs `react` 18. Depends on `@zekel/primitives` and `@zekel/wire-types`.

Part of [Zekel Universe](https://github.com/xephoid/zekel-universe), the web
client for the zekel board-game engine. Apache 2.0.
