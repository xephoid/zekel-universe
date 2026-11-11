# @zekel/primitives

The eight board primitives as React components: card, card zone, tableau, bag,
track, pool, grid and map. Each takes the same data fields as the zekel
engine's web component of the same name (`CardData`, `CardZoneData`, and so
on), so a board description written for the engine works here unchanged. Each
emits one select event with component, id and label, and each accepts the
previous value of its data and animates the difference: cards fly from a pile
to a zone, pieces slide along their path, tokens drop. Nothing appears in
place.

```ts
import { Card, CardZone, Tableau, Bag, Track, Pool, Grid, Map, FlipRoot } from '@zekel/primitives';
import '@zekel/primitives/css';
```

Parts carry color keys; a game supplies the palette that maps them to colors.
Needs `react` and `react-dom` 18, and `@zekel/tokens/css` loaded by the host.

Part of [Zekel Universe](https://github.com/xephoid/zekel-universe), the web
client for the zekel board-game engine. Apache 2.0.
