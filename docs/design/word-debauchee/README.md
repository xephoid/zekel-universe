# Word Debauchee: the design canvas

Start here. This folder is the source of truth for how the Word Debauchee table
looks. Unlike the other game tables it has no theme of its own: one centered
column in the brief's own look (cream, forest green, orange, warm but flat), with
letter tiles as the only thing drawn. It should feel as simple as a daily word
game.

The rules live in the `word-debauchee` package of zekel-games, with the engine as
the source of truth. Nothing in this folder is a rule. The boards show one sample
round (Ann holds HAPPY, with the clues Letters, Type and Opposite), not a fixture.
The two playable boards run a small scripted stand-in for the engine, for the
demo only.

## What is here

| File | What it is | Status |
|---|---|---|
| `Main.dc.html` | The guesser's table, playable: clues, Ann's letters, the build area, the pool as a keyboard. Tweak `dark`. | Proposed |
| `Debauchee.dc.html` | The debauchee's table, playable: keep a word, hide one clue, answer a judgment clue, watch, lay down letters. Tweak `dark`. | Proposed |
| `Phone.dc.html` | The guesser's table at 390 × 844, static. | Proposed |
| `Setup.dc.html` | Seats, who goes first, how letters come down, the variants. | Proposed |
| `Round-End.dc.html` | Cracked, stumped and the final scores. | Proposed |
| `Moments.dc.html` | Moving a tile, a check that says no, a word said out loud, Bribe, the pool out of a letter, an AI's turn, the 30-second timer, The House, using your own tiles. | Proposed |
| `canvas.json` | Where each board sits on the canvas. | |

Each `.dc.html` file is a design-canvas page. The canvas runtime (`support.js`) is
not in this folder, as with the other canvases.

## Decisions the boards depend on

- **No blank squares for the secret word.** Word length is only known if the
  Letters clue is played, and letter positions are never shown. Revealed letters
  line up in the order they were laid down, with no empty slots.
- **No per-letter colors.** A check answers only yes or no, so tiles never get
  right-letter or right-place marks.
- **The pool is a keyboard.** Each key shows how many tiles of that letter are
  left. Physical keys work too: a letter picks a tile, Enter confirms, Backspace
  undoes.
- **Nothing counts until you confirm.** A guesser gets one action a turn, so a tile
  is only held until Place or Move. "Place and Check!" is one press, so another
  player can't move before the check.
- **Each row shows what it would pay.** The shrinking payout is the game's tension,
  so the sum is on screen and nobody has to do it.
- **The debauchee picks the letter.** The engine never picks a letter to reveal,
  and when the pool has none the debauchee says which row it comes from.

## Not settled

- Whether table chat, if Universe adds it, burns typed words by itself. The boards
  have anyone report a word by hand.
- Whether Universe offers the "use your own tiles" option at all. It adds a second
  screen for people around one real table.
- Tap targets. The gaps between tiles and the phone keys are under 44 px and need
  the phone pass.
- These boards have not been rendered and checked in a browser yet.
