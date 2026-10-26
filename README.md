# Sarzee

A dice game for 1–4 players, hot-seat, with optional CPU opponents and ten themed
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
  scoreAdvice.ts       Ranks a roll's open boxes, which the scorecard makes glow.
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
  ScoreTable.tsx       The scorecard: a paper score pad in real DOM, every size.
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
3. `npm run opt:textures` to downsize and re-encode it, and commit the updated
   `scripts/texture-manifest.json` with the image.

JPEG and palette PNG are lossy, so the script leaves alone anything the manifest says it
has already processed. An image it has not seen is only rewritten if it is wider than its
target or the re-encode saves at least 10% and 20 KB; otherwise it is just recorded. Use
`--force` to re-encode everything anyway.

Every board is drawn to one template, and each part of it is a rect in `lib/boards.ts`:

| Rect | What it is | Used for | L overlay |
|---|---|---|---|
| `felt` | the square recess in the centre | where dice roll | green |
| `arena` | the felt plus both trays, same height as the felt | the 3D canvas | yellow, dashed |
| `heldTray` | the five slots down the left | where held dice park | magenta |
| `rollsTray` | the five slots down the right | the middle three light as rolls left | orange |
| `rollPlate` | the plate along the bottom | the ROLL button | blue |
| `titlePlate` | the plate across the top | the HUD: player, rolls, Rules / Stats / Leave | red |
| `unit` | the wooden board without the table dressing | framing on narrow screens | — |

The `DEFAULT_*` values fit every board drawn to the template, so a new board usually
needs nothing else. If a render drifts, press **L** and override just the rects that are
off for that board (the Map Room's plates and map sit lower; the Midnight Casino's slots
are spaced wider). Keep `arena` centred on the felt and the same height as it, with both
trays inside it.

Per-board look, all optional except the first two:

- `diceColors`: six named colours drawn from the artwork; the first four are the seat
  defaults in seat order.
- `theme`: the colours for the HUD, the ROLL button, the scorecard rail and the setup
  screen. ROLL is drawn in CSS from `buttonGradientFrom` / `buttonGradientTo`,
  `buttonText` and `border`; the rolls-left lamps use `accent`.
- `particles`: ambient motes over the felt, when the setting calls for them.
- `feltVignette` (0 to 1): darkens the centre of an illustrated felt so pips stay
  readable at phone size.
- `diceSkin.shadowOpacity`: a heavier contact shadow for dark, busy felts.

When generating new art, ask for a plain textured felt (texture, not illustration), an
empty title plate and empty trays: the app draws the HUD and the lamps itself.

#### Generating board art that fits the template

The layout only fits if the render keeps the template's proportions, so give the image
model an existing board as a layout reference rather than describing the layout alone.
Midnight Casino, Delilah's Garden and the regenerated Forge, Emerald Forest and Pirates
Cove were made this way with gpt-image (no watermark):

1. Scale a template board (`linguiniii_board.jpg` has the cleanest recesses) to 1536×820
   and mirror-pad it to 1536×1024, gpt-image's 3:2 size.
2. Attach that as the reference with a prompt like the one below.
3. Crop the render back to the middle 1536×820 band, scale it to 1920×1025, save it in
   `public/textures/` and run `npm run opt:textures`.
4. Press **L** and override any rect that drifted.

> Use the attached reference image as an exact layout template and redraw it as a
> differently themed dice-game board. Keep the board geometry exactly the same as the
> reference: same position in the frame, same size, same proportions and placement of
> every recess. Top-down photograph, camera directly overhead. Keep exactly: a square
> board in the middle of the frame; a recessed rectangular title plate across the top
> centre; a large square recessed playing area in the centre; a vertical column of five
> small square recessed slots down the left side and an identical column of five down the
> right side; a recessed rectangular plate along the bottom centre; a round recessed
> medallion in each of the four corners. New theme, *[name]*: *[the board's materials]*.
> The central playing area is a plain, flat, evenly textured surface of *[felt]*, evenly
> lit, with no illustration and no symbols. The title plate and bottom plate are empty,
> with no text. The ten small slots are empty plain recessed sockets. The four corner
> medallions hold *[...]*. Table dressing outside the board only: *[...]*. No text, no
> letters, no logos, no watermark, no dice anywhere.

Pick a felt of middle lightness: it has to show both the lightest and the darkest of the
board's six dice colours.

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
| `npm run opt:textures` | downsize/re-encode new or changed art in `public/` (`-- --dry`, `-- --force`) |
| `npm run opt:audio` | encode and level-match sounds (`-- --dry`, `-- --force`) |
| `npm run gen:chime` | re-synthesise the turn chime into `public/sounds/chime.mp3`; run `opt:audio` after it |
| `npm run gen:icons` | redraw the favicon, home-screen and manifest icons from the die mark |
| `npm run gen:card` | re-photograph the link-preview card from a built `out/` (`-- --board <id>`, `-- --rolls <n>`, `-- --dice <name>`) |

## Link previews and icons

What a shared link looks like in iMessage, WhatsApp, Slack or a social feed comes from
three places, all read from `lib/site.ts` so the copy stays consistent:

- `app/layout.tsx` sets the title, description and Open Graph / Twitter tags. Next.js
  turns `app/opengraph-image.jpg` (with `app/opengraph-image.alt.txt`) into the preview
  image tags, and `app/icon.png`, `app/apple-icon.png` and `app/favicon.ico` into the
  icon tags, from the filenames alone.
- `app/manifest.ts` is the web app manifest, which is what lets a phone add Sarzee to its
  home screen as an app. Its icons live in `public/icons/`.
- `scripts/brand-icons.js` draws every icon from one vector mark, and
  `scripts/social-card.ts` photographs the preview card from the real game in headless
  Chrome, so a change to a board or the mark is one script run away from the icons.

Facebook, LinkedIn and iMessage cache a link's preview. After changing the card, paste the
URL into Facebook's Sharing Debugger and LinkedIn's Post Inspector to make them fetch it
again; Next.js adds a hash to the image URL on every change so stale copies are not reused.

## Deployment

Static export (`output: 'export'`), deployed to Netlify. Note that `public/` filenames are
case-sensitive on most hosts — keep the names in `lib/boards.ts` matching the files
exactly, and make sure new art is actually committed.
