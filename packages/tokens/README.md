# @zekel/tokens

Zekel Universe's design tokens: the colors, fonts, radii, shadows and motion
durations of its warm-but-flat look, as a TypeScript object and as CSS
variables.

```ts
import { tokens, motionMs } from '@zekel/tokens';
import '@zekel/tokens/css'; // the CSS variables, once, at the app's root
```

A game's drawing code reads its timings and colors from here and nowhere
else, so a game looks at home on the table and moves at the table's pace.

Part of [Zekel Universe](https://github.com/xephoid/zekel-universe), the web
client for the zekel board-game engine. Apache 2.0.
