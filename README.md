# Sarzee

A dice game for 1–4 players, hot-seat, with optional CPU opponents and eight themed
tabletops. Next.js static export, three.js for the dice.

```bash
npm run dev      # http://localhost:3000
npm test         # game rules + dice simulation
npm run build    # static export to out/
```

## How it fits together

```
lib/
  SarzeeEngine.ts      Rules and scoring. Knows nothing about rendering.
  CpuAgent.ts          Hold/score decisions for the three CPU personalities.
  boards.ts            Every board: artwork, geometry, palette, dice finish.
  useBoardLayout.ts    Projects board-image coordinates into screen pixels.
  useSarzeeGame.ts     Game state and the actions that change it.
  sounds.ts            Every sound: file, volume, preload and encoding profile.
  useGameSounds.ts     The only thing in the app that touches an Audio element.
  useCpuTurn.ts        Drives CPU seats through the same actions a human uses.
  diceSimulation.ts    Headless physics roll (see below).
  dieFaces.ts          Face/axis mapping and the pip relabelling.
components/
  BoardStage.tsx       Paints the board and positions everything on it.
  DiceArena.tsx        The 3D felt: owns the roll, renders the dice.
  MultiPlayerScorecard Illustrated paper scorecard (wide screens).
  ScoreTable.tsx       DOM scorecard (narrow screens).
```

### Layout: board coordinates, not viewport percentages

Every hotspot — the felt, the ROLL plate, the board itself — is defined once in
`lib/boards.ts` as a rect in **fractions of the source image**:

```ts
felt: { x: 0.3365, y: 0.2185, w: 0.3465, h: 0.5288 }
```

`useBoardLayout` measures the container, works out how the image is being drawn, and
projects those rects into pixels through that same transform. So the dice arena is always
exactly on the felt and the ROLL button always sits in its recess, at any window size and
on any board.

Two arrangements, chosen from the window's shape rather than from device sniffing:

| Shape | Layout |
|---|---|
| wider than 1.2:1 | board fills the screen, scorecard in a rail on the right |
| taller than that | board framed whole at the top, scorecard below |

In the stacked layout the board is fitted to its **`unit`** rect — the wooden board
without the surrounding table dressing — so the theme survives on a phone. The plants and
coffee cup are the first thing worth losing; the board is not.

To check alignment, run the dev server and press **L** (or add `?debugLayout=1`) to draw
the projected rects over the artwork.

### Adding a board

1. Drop the image in `public/textures/`.
2. Add an entry to `BOARDS` in `lib/boards.ts`.
3. `npm run opt:textures` to downsize and re-encode it.

The shared `DEFAULT_FELT` / `DEFAULT_ROLL_PLATE` / `DEFAULT_BOARD_UNIT` values fit every
current board, since they come from one template. A board framed differently can override
any of them.

### The dice

A physics roll looks right but cannot be told what to land on, and occasionally throws a
die off the table. A hand-authored animation is controllable but reads as fake, because at
some point it has to rotate the die into its answer.

`lib/diceSimulation.ts` takes a third route, exploiting the fact that a die is a symmetric
cube:

1. Simulate a completely free roll headlessly (cannon-es), in about 8 ms.
2. Discard and re-run if any die left the felt, ended up cocked, or is still moving. Bad
   rolls are never shown, so dice cannot land off the surface.
3. Read which face happened to land up, then rotate the **pips inside the cube** so that
   face shows the value the game already decided.
4. Play back the recorded trajectory.

Step 3 is invisible: the relabelling comes from the cube's own rotation group, so opposite
faces still sum to seven and the die is still a proper right-handed die. Everything on
screen is real rigid-body motion, and the outcome was fixed before the first frame.

`npm test` checks all 36 face combinations and asserts that hundreds of rolls land legally
and display the intended values.

### Sound

`lib/sounds.ts` is the registry. Adding a sound is three steps:

1. Drop the file in `public/sounds/`.
2. Add an entry: its `volume`, whether it `preload`s eagerly, and its `profile`.
3. `npm run opt:audio`.

The script reads that same registry, so encoding settings and playback volume can't drift
apart. `ui` sounds become mono 96k; `feature` sounds stay stereo at 128k. Everything gets
level-matched — short effects on RMS with a limiter, longer clips to EBU R128 — so a new
sound arrives at roughly the same loudness as the rest and `volume` stays a creative
choice rather than a correction.

It rewrites files in place and MP3 is lossy, so `scripts/audio-manifest.json` records what
it produced and unchanged files are skipped. Use `--force` to re-encode anyway, and expect
generation loss if you do it repeatedly.

Two things worth knowing:

- **Strip metadata.** `sarzee.mp3` was 2,182 KB, of which 2,079 KB was an embedded album
  cover. The pipeline drops ID3 tags, which is where most of the savings came from.
- **Provenance goes with the tags.** If a clip's origin matters to you, note it somewhere
  else — the encoder removes artist and title along with the artwork.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server on `0.0.0.0:3000` |
| `npm run build` | static export to `out/` |
| `npm test` | rules and dice-simulation tests |
| `npm run opt:textures` | downsize/re-encode art in `public/` (`-- --dry` to preview) |
| `npm run opt:audio` | encode and level-match sounds (`-- --dry`, `-- --force`) |

## Deployment

Static export (`output: 'export'`), deployed to Netlify. Note that `public/` filenames are
case-sensitive on most hosts — keep the names in `lib/boards.ts` matching the files
exactly, and make sure new art is actually committed.
