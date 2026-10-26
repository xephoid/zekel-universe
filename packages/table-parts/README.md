# @zekel/table-parts

The table furniture a zekel game's own screen may draw:

- `Sheet`: the table's one dialog. It traps focus, closes on Escape or a tap
  outside, and hands focus back to whatever opened it.
- `MoveFormSheet`: a template move's questions in a sheet. The move is built
  from the person's answers and sent only when they press Send.
- `PaceControl`: the playback pace buttons.

```ts
import { Sheet, MoveFormSheet, PaceControl } from '@zekel/table-parts';
import '@zekel/table-parts/css';
```

The styles here hold only what these parts add; the colors come from
`@zekel/tokens/css`, and the fields inside a move form take the host's own
`.field`, `.label`, `.radio-row` and `.btn` styles. Needs `react` 18. Depends
on `@zekel/glue-kit`.

Part of [Zekel Universe](https://github.com/xephoid/zekel-universe), the web
client for the zekel board-game engine. Apache 2.0.
