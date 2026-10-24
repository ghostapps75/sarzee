# Sarzee project audit

Date: 24 October 2026. Branch audited: `main` at commit 45629c5.

**Update, later the same day.** The fixes and cleanup below have been made on the branch
`claude/project-audit-board-redesign-1c52e9` in three commits:

- `1333ea5` Score the upper bonus and roll from engine state (bugs 1 and 2, with a test)
- `8e3ad22` Prune unused files, scripts and dependencies (section 4, bugs 6 and 7, the
  animation package, and the three merged branches deleted locally and on origin)
- `e329186` Record draws, export every column, survive rotation mid-roll (bugs 3, 4, 5, 8)
- `78931c2` Export the scorecard PDF as a JPEG page (the rebuilt export came out at 20 MB
  as a PNG; it is about 550 KB now)

All four were checked against the production build: tests, TypeScript, ESLint and
`next build` pass, a full two-player game was replayed on the static export, the board
survived a rail-to-stacked flip mid-roll without remounting, and the PDF export produced a
valid one-page file with every column.

Still open from the list: keyboard access (bug 9), the Joker rule and the other rough edges
(bug 10), everything in section 3, and the board work in section 5, which is running in its
own session. The dead-code trims in `Die.tsx` and `lib/boards.ts` were left alone so they
would not collide with that session's edits. The rest of this document is the audit as it
was written, before the fixes.

---

## 1. Where the game stands

Sarzee is a finished, playable game. The codebase is small, well-commented and consistent, and the
recent run of work (board-coordinate layout, physics dice, audio pipeline, paper score pad, phone
layout) all holds together. It is live at https://sarzee.netlify.app and the live site shows the
current eight-board setup screen.

| Check | Result |
|---|---|
| `npm run build` (static export) | passes, 6.0 MB `out/`, biggest JS chunk 1.1 MB (three.js) |
| `tsc --noEmit` | clean |
| `eslint .` | clean, zero warnings |
| `npm test` | **fails** on one timing assertion (see bug 6); the rules, relabelling and advice tests all pass |
| `npm run lint` | **broken**: `next lint` was removed in Next 16 |
| Live site | up, serving the eight-board setup screen |
| Tracked files | 72 files, 3.4 MB (textures 2.3 MB, sounds 0.2 MB, code 0.3 MB) |
| `.git` | 39 MB (old 1 to 2 MB assets in history; see section 4) |

Features in place: 1 to 4 hot-seat players, three CPU personalities with narration, eight themed
boards each with its own dice palette and finish, physics-simulated dice that always land legally,
held-dice tray, scorecard with ranked advice, Sarzee and Nancy celebrations with sound, upper and
Sarzee bonuses on the card, Joker scoring, match history and stats drawer, rules drawer, PDF export
of the score pad, rail and stacked layouts chosen from window shape, low-power mode on phones.

What I checked live in the browser: all eight boards at desktop (1024x768, rail) and the Café at
phone size (375x812, stacked). The felt, held tray and roll plate rects project onto the artwork
correctly on every board I measured. The stacked phone layout is excellent. Rolling, scoring
advice and holding a die all worked (holding verified through the arena's dev hook, since the
preview pane throttles animation frames).

---

## 2. Bugs to fix before calling it complete

Ranked. The first two are the ones I would not ship without.

### 1. The upper-section bonus is never added to a player's total (confirmed)

`lib/SarzeeEngine.ts` has no 63-point check anywhere. `commitScore` adds the category score and the
Sarzee bonus to `totalScore` and nothing else. The scorecard independently computes the 35-point
bonus for display (`components/ScoreTable.tsx` line 171), prints it in the Bonus row, and then
derives Lower Total as `total - (upper + bonus)`, so a player who earns the bonus sees their
Lower Total understated by 35 and a Grand Total that is 35 short. Game-over standings, the winner,
and the match log all use `totalScore`, so a player who earned the bonus can lose a game they won.

Repro: score 3 Ones, 6 Twos, 9 Threes, 12 Fours, 15 Fives, 18 Sixes (upper sum 63). The card shows
Bonus 35 and Upper Total 98 but Grand Total 63.

Fix: track `upperBonus` in `GameState`; in `commitScore`, when the upper sum first reaches 63 add 35
to both. Have `ScoreTable` read the engine's value instead of recomputing it, and add a test.

### 2. CPU re-rolls use a stale closure, so celebration checks see wrong values (confirmed)

`lib/useCpuTurn.ts` changes holds through `engine.toggleHold`, then schedules `roll` from the closure
captured when the effect ran, before those holds existed. The `busy` guard stops the effect
re-running with the fresh `roll`. That stale `roll` (`lib/useSarzeeGame.ts` around line 517)
builds its `decided` values from the old `heldDice`, so it rolls fresh random numbers for dice the
CPU is holding. The engine ignores those (it honours its own holds) and the arena only throws
unheld dice, so the board looks right. But the arena emits `decided` as the result, and that is
what `handleTurnComplete` checks for Sarzee and Nancy. A CPU that holds four 6s and rolls the fifth
gets no celebration and the match log undercounts; false celebrations are also possible.

Fix: in `roll`, read `engine.getGameState()` for held dice and values rather than the React
snapshot. One-line change, removes the whole class of staleness.

### 3. Draws are logged as wins, and "Win Rate (vs AI)" counts games with no AI (confirmed)

`lib/matchLog.ts` takes the first highest score as the winner, so a tie is recorded as a win for the
lower seat, and the stats list says "Player 1 Won" while the game-over card said it was a draw.
`components/StatsDashboard.tsx` counts every game containing a human toward the vs-AI win rate,
including solo games, which a human always "wins". Five solo games plus five losses to Bobby shows
50%. Fix: record `isDraw`, and only count games that had both a human and a CPU.

### 4. PDF export captures only the visible player when the card is tabbed (confirmed)

The score pad switches to tabs when the rail is narrower than it needs for every column
(`components/ScoreTable.tsx` line 164). The export captures the live DOM, so with 3 or 4 players on a
roughly 1000 px window, or any phone, the PDF holds one column. Fix: render an untabbed clone
off-screen for the capture, or pass a `forceAllColumns` prop while exporting. The
`helper-exclude-pdf` filter in `app/page.tsx` targets buttons that are not inside the captured
node, so it does nothing and can go.

### 5. Rotating a phone during a roll freezes ROLL for up to 8 seconds (confirmed by reading)

`app/page.tsx` renders the stage under different parent elements in rail and stacked mode, so a
layout flip remounts `BoardStage` and `DiceArena`. The in-flight playback lives in the old arena
and is dropped; `onTurnComplete` never fires; `isRolling` stays true until the 8-second watchdog.
A celebration that is showing also remounts and restarts its timer and sound. Fix: keep the stage
at a stable position in the tree and switch layout with styles, or treat a mount with `values` and
no playback as "settled".

### 6. The dice-simulation test has a machine-dependent timing assertion

`lib/diceSimulation.test.ts` line 161 asserts each roll generates in under 60 ms. On this machine
the square felt measured 64 ms and the suite failed. The number depends on CPU load, so it will
fail on CI or a busy laptop. Either loosen it to something generous (250 ms) or print it as
information rather than asserting.

### 7. `npm run lint` is dead

`next lint` was removed in Next 16; the script errors immediately. Change it to `eslint .`
(which is clean today).

### 8. Entrance animations are silently doing nothing (plausible, worth a look)

`animate-in`, `fade-in-50`, `zoom-in-50`, `slide-in-from-bottom-5` appear across the setup panel,
celebrations and game-over card. Those are `tw-animate-css` classes and that package is not
installed; Tailwind v4 emits nothing for them. Either install it and `@import "tw-animate-css"` in
`app/globals.css`, or remove the classes.

### 9. Keyboard players cannot pick a board or hold a die

Board cards in `components/SetupPanel.tsx` are `div`s with `onClick`, so step one is pointer-only.
Holds exist only as clicks on 3D meshes. Make the cards `button`s and bind keys 1 to 5 (or add five
visually hidden toggle buttons) to `toggleHold`.

### 10. Small rough edges

- The Joker rule scores Full House and straights correctly but is not enforced (a Joker Sarzee can go
  anywhere) and is not mentioned in the Rules drawer. Either enforce it or document it as the house rule.
- The HUD's rolls-left counter drops the moment ROLL is tapped, about 1.5 s before the dice land.
- At game over `activePlayer` wraps to seat 0, so Player 1 is highlighted as active on the card.
- A celebration fires 1 s after landing, but the CPU effect has already scheduled its next beat, so
  a CPU can score and pass the turn behind the overlay.
- `StatsDashboard` reads `log.winner.name` without a guard; a hand-edited or very old log would throw.
- There is no mute or volume control anywhere in the game.

---

## 3. Improvements worth making (not blockers)

- **Dice readability on dark and busy felts.** Obsidian on the Forge is near-invisible at rest (only
  the magma pips show); Emerald on the Emerald Forest sits on a green illustration. Raise the contact
  shadow on dark boards (the `shadowMaterial` opacity is a flat 0.3) and check each board's seat-1
  default against its felt luminance. See section 5 for the art-side fix.
- **Board picker thumbnails** are 64 px crops of the felt centre, so they do not show the board.
  Crop to the `unit` rect (the wooden board) and make them wider.
- **Installable on iPad.** `appleWebApp` is set but there is no web manifest, `apple-touch-icon`, or
  theme colour, so "Add to Home Screen" gets a blank icon. A manifest plus two PNG icons is an hour.
- **Load the 3D stack lazily.** `BoardStage` is imported statically, so three.js (1.1 MB) downloads
  before the setup screen paints. `next/dynamic` on `BoardStage` lets setup appear first and fetches
  the arena while the player picks a board.
- **Dependencies.** `@types/three` and `postcss` belong in `devDependencies`. `ts-node` is unused
  (`tsx` is used). `dotenv` is only used by the dead Meshy script (section 4). `sharp` is used by
  `scripts/optimize-textures.js` but is not declared; it only works because Next pulls it in
  transitively, so declare it as a devDependency.
- **Tests.** Add an engine test for the upper bonus and a test for `isNancy`; both are a few lines.
- **Copy.** "Premium 3D Physics Tabletop Arena" and "Sarzee Premium Edition © 2026" read like
  placeholder marketing; worth deciding on the voice before you call it done.
- **Franklin's Tower** uses Grateful Dead trademarks (Steal Your Face, dancing bears, ticket stubs).
  Fine for a family game; it would be the first thing to replace if this ever went in a store.

---

## 4. Files and repo hygiene

The repo is already lean: 3.4 MB tracked, no build output or secrets committed, `.gitignore` is
right. These are the leftovers.

### Delete (unreferenced by any code)

| File | Why |
|---|---|
| `public/next.svg`, `public/vercel.svg`, `public/globe.svg`, `public/file.svg`, `public/window.svg` | create-next-app boilerplate, never referenced |
| `public/textures/ghost_poker_profile-jan26_small.jpg` | a poker-ghost avatar from another project; no board uses it |
| `scripts/generate-dice.js` and the `gen:dice` script | calls the Meshy text-to-3D API to make `die-model.glb`, which does not exist and which `Die.tsx` never loads (the die is built procedurally). Remove it and the `dotenv` devDependency with it |
| `ts-node` devDependency | unused; `tsx` runs the tests and the audio script |

### Dead code to trim

`SarzeeEngine.debugSetNearEndgame`; `interface Die` in `lib/types.ts`; `DieHandle` and its
`useImperativeHandle` in `Die.tsx`; `DiceArenaHandle.roll`, `forceResult`, `getVisualValues`,
`getLastEmittedValues`, `getRollSeq`; `boardTextureUrl` in `lib/boards.ts`; the `setPhase`,
`allStates`, `sarzeesInGame`, `nancysInGame` returns from `useSarzeeGame` (no consumer); the
`MatchLog` re-export in `StatsDashboard.tsx`.

### Git branches

Three branches are fully merged into `main` and exist both locally and on origin:
`feature/premium-upgrades-and-cpu-opponent`, `sarzee-current`, `sarzee-dice-cinematic-pinned`.
Delete them on both sides. `main` and `origin/main` are in sync.

### Repository size

`.git` is 39 MB against 3.4 MB of tracked files because earlier commits carried
`sarzee.mp3` at 2.2 MB (album art in the ID3 tag), 1.2 MB board renders, `scorecard_bg.png`,
`urbantech_board.jpg` and the `_archive_legacy/` folder. All of that is already deleted from the
tree. Rewriting history to drop it would shrink a fresh clone from 39 MB to about 6 MB, but pushes
are incremental, so you are not re-uploading any of it. I would leave history alone.

Nothing in the ignored folders is uploaded: `node_modules` 737 MB, `.next` 176 MB, `.claude` 160 MB
(this worktree), `out` 6 MB. `.claude/launch.json` is the one tracked `.claude` file and is harmless.

### Assets

- Every board image carries the Gemini sparkle watermark in its bottom-right corner. In practice it
  sits under the scorecard rail or outside the `unit` crop, so players never see it, but crop it off
  the next time the boards are regenerated.
- `pirate_board.jpg` is the only board at 1024 px wide (the others are 1920); it is visibly softer
  on a desktop screen.

---

## 5. Boards: upgrading the template, and new concepts

All eight boards share one template: square wooden frame, title plate across the top, felt in the
centre, five-slot trays left and right, roll plate along the bottom, four corner medallions, table
dressing around. That consistency is what makes the single set of layout rects work, so keep the
template. The upgrades below mostly change how the app uses the art, not the art itself.

### 5a. Template changes that pay off on every board

1. **Give the HUD its own home.** The active-player panel and the Rules/Stats/Leave buttons sit on
   top of the title plate on every board, and cover it entirely on a phone. Two good options:
   render the HUD inside the title plate (player name, dice chip, rolls left, in the board's theme
   colours) and have the artwork's plate be blank; or keep "SARZEE" but paint it in CSS with the
   theme's `titleGradient` so it is crisp at every size and can step aside for the HUD. The
   layout system already projects rects into pixels, so a `titlePlate` rect in `lib/boards.ts` is
   all the geometry that needs adding.
2. **Use the right-hand tray.** The art has five empty slots there and nothing ever goes in them.
   Cheapest and most natural: a rolls-left indicator (three slots light up and go dark as rolls are
   spent). Also good: ghost the previous player's final five dice there so hot-seat players can
   see what they are chasing. Either one makes the board feel designed for the game rather than
   decorated.
3. **Theme the ROLL button in CSS.** The same copper-and-blue plate sits on the lava, the nebula
   and the forest. A CSS button using the board's `buttonGradientFrom/To` and `buttonText` is
   free, crisp and themed, and it removes a 55 KB PNG. If you prefer art, regenerate one plate per
   board.
4. **Quiet the felt under the dice.** Four boards (Emerald, Franklin's, Pirates, Map Room) have a
   full illustration where the dice land, and pips get hard to read over it at phone size. A
   per-board radial vignette over the felt rect (darken 15 to 25 percent toward the centre) fixes
   readability without touching the art, and makes the dice pop. When regenerating, ask for
   "texture, not illustration" in the centre and put the picture in the frame.
5. **Contact shadow and rim.** Raise the dice shadow opacity on dark boards (Forge, Cosmic) and
   add a faint rim light so a black die on black rock still has an edge.
6. **Regenerate the weakest three.** Forge (the title lettering and the right-tray glyphs show AI
   artifacts), Emerald Forest (the rune and bear motifs are mush), and Pirates Cove (1024 px). Crop
   the watermark on the way through. For photoreal boards with clean lettering use `imagegen`
   (gpt-image); it also leaves no visible watermark. `nano-banana` is fine for fast drafts.

### 5b. New board concepts

Each keeps the template geometry so it drops in with a `BOARDS` entry and no layout work. Six
first-four seat colours are listed in seat order (seat 1 is the signature), plus the particle idea.

| Board | Pitch | Dice (seat 1 to 4) | Particles |
|---|---|---|---|
| **Midnight Casino** | Green baize, art-deco brass, stacked chips and a martini at the edge. The "classic" board the set is missing. | Ivory, Casino Red, Chip Black, Brass | none |
| **Delilah's Garden** | Sunlit garden table, trailing roses and lavender in the frame, a teacup and secateurs on the table. The companion to Sarzee's café. | Rose, Lilac, Butter, Sage | butterflies, slow drift |
| **Deep Reef** | A coral-encrusted board on the sea floor, bioluminescent frame, light rays from above. | Pearl, Coral, Sea Glass, Squid Ink | bubbles, rise |
| **Winter Lodge** | Snowed-in cabin table, plaid felt, antler inlays, cocoa and a lantern. Seasonal favourite. | Cream, Cranberry, Pine, Slate | snow, drift |
| **Tokyo Neon** | Black lacquer board on a rain-slick street-food counter, neon signage reflected in the frame. | Hot Pink, Electric Blue, Lacquer Black, White | neon motes, drift |
| **Pharaoh's Tomb** | Sandstone board with hieroglyph trays, lapis and gold inlays, torchlight. | Lapis, Carnelian, Gold, Bone | dust, rise |

A master prompt that keeps the geometry (adapt the theme clause per board):

> Top-down photograph of a square wooden dice-game board on a table, 16:9. The board fills the
> middle 60 percent of the frame. Layout, exactly: a recessed rectangular title plate across the
> top; a large square recessed felt playing area in the centre; a vertical column of five small
> square recessed slots down the left side and another down the right; a recessed rectangular plate
> along the bottom; a round medallion in each corner. The felt centre is a plain textured surface
> with no illustration. Theme: [...]. Table dressing around the board: [...]. No text, no logos, no
> watermark, no dice on the felt.

Then measure nothing: the existing `DEFAULT_FELT` and friends fit if the proportions match; if a
render drifts, press L in dev and override `felt` / `rollPlate` / `unit` for that board.

### 5c. A bigger idea, if you want the boards to feel alive

Split each board into two layers: the frame as a PNG with a transparent felt window, and the felt
as a separate texture. The felt can then be swapped per player colour, dimmed under the dice,
animated (Cosmic's nebula drifting, Forge's magma pulsing), or replaced seasonally, all without
regenerating the frame. It is more work than anything above and only worth it if you want to keep
adding boards.

---

## 6. Suggested order

1. Bugs 1 and 2 (scoring and CPU closure), with tests. Half a day.
2. Lint script, the timing test, file and dependency cleanup, stale branches. An hour.
3. Bugs 3 to 5 and the animation plugin. Two to three hours.
4. Template upgrades 1 to 5 (HUD, right tray, CSS ROLL, vignette, shadows). A day.
5. Regenerate the weakest three boards, then add new ones from the concept list.
