# asciiQuake render performance — findings, landed work, and ranked next steps

Measured on a **recorded human play session** through e1m1 (1,547 samples, ~18k
Quake units, 86 shots), replayed deterministically at **2560×1440 / 20,916 cells**
in headed Chromium on a real GPU. All numbers are ms per displayed frame.

Harness: `test/perf/glyphBench.mjs` (committed). It reports cost **and** a
fidelity digest, because every ASCII-renderer "optimization" can be faked by
rendering less.

---

## Headline result

**Main-thread time per frame fell 35%, with byte-identical output.**

| | task | script | layout | other (paint/compositor) | renders/frame |
|---|---|---|---|---|---|
| before | 10.97 | 4.93 | 0.89 | **5.15** | 1.97 |
| after | **7.13** | 5.69 | 0.88 | **0.59** | **0.99** |

The win is not where it looks. `script` barely moved; the **`other` bucket
collapsed 5.15 → 0.59 ms**. That block was the browser paint/compositor cost of
DOM writes that were being thrown away.

---

## The defect: the scene rendered ~3× per displayed frame

In real gameplay every render stage fired **3.16× per displayed frame** —
`base-validate`, `base-project`, `base-raster`, `base-encode`, `commit-write`,
all of them. 189 complete grid renders per second at 60 fps. Only the last of
each frame is ever painted.

**Mechanism.** glyphcss coalesces renders on a **microtask**:

```js
// createGlyphScene.ts
pendingRender = true;
Promise.resolve().then(() => { ...doRender(); });
```

A microtask checkpoint drains at the end of *every task*. asciiQuake touches the
scene from several tasks per frame — the game loop's rAF, the pointer-look
handler, a 30 Hz pickup interval, weapon-fire timeouts — so each one bought a
full rasterize + encode + DOM write.

The dominant contributor was **one entity**: the weapon viewmodel, synced from
both the mousemove path and the game-loop path (`App.ts:1700-1720`).

**Fix** (`d04e721`, branch `perf/stage-entity-mutations`): `setEntity`,
`setEntityTransform` and `removeEntity` stage into a map; `renderFrame` applies
them synchronously immediately before `scene.rerender()`.

Two details are load-bearing:

- **Staging must happen at the overlay's three sinks, not at call sites.** A
  material share of mutations arrive from timer and event tasks that no call-site
  relocation can move into a rAF callback.
- **The flush must be inside `renderFrame`, before `rerender()`.** `rerender()`
  bumps glyphcss's `renderGeneration`, superseding the microtask queued by that
  same task. Flushing anywhere else — even in its own rAF — leaves that microtask
  alive and still costs 2 renders/frame (measured: 2.01).

`setEntityTransform` answers "is this entity registered?" from the post-flush
view, so callers don't spuriously re-register; `"poly"` composite still applies
staged ops so entity state can't go stale.

---

## Fidelity: proven, and the proof nearly went wrong

The atlas-mode digest **changed** (`bbe4734c…` → `83880ce8…`), stable across
runs. Diffing the grids showed **85% of cells differing** — which looks like a
serious regression.

It wasn't. The structure was identical — same glyphs, same run lengths, same
positions — only the PUA code points differed:

```
main        …
staged      …
```

A PUA code point encodes *(glyph, palette-slot)*. The atlas's 30-slot palette is
derived by median-cut over the grids the quantizer happens to train on — so
changing **how many renders happen per frame retrains it**, permuting slot
indices while painting the same colours.

Re-run in `spans` mode, where colours are literal `#rrggbb`:

```
glyph text : 0 / 250,992 = 0.000% differing cells
innerHTML  : 0 / 12 stops differ
control (main vs main) : 0.000%
```

**Byte-identical.** Gating on the atlas digest would have rejected a correct
optimization — this is now documented in the harness.

---

## Also landed

**Cell budget (`252993a`).** Detail presets were fixed pixel sizes, so cost
scaled with viewport *area*: "Normal" was ~10.6k cells at 720p and ~42k at 1440p,
where p95 frame time doubled to 33 ms. Presets are now **cell budgets**
(`cellPx = sqrt(W·H / (0.606 · budget))`), Normal = 20k, holding ~19–21k cells
from 720p to 4K. p95 at 2560×1440: **33.3 → 17.5 ms**.

**glyphcss `62b99cf`** (local, unpushed): `baseProjectionGrid()` read
`host.getBoundingClientRect()` every render — a forced synchronous layout. Cached
with the same lifetime as the cell probes beside it. Measured: atlas 70 → 97 fps,
layout 4.94 → 1.00 ms/frame. Mutation-checked (reverting it fails the new test
with 24 reads across 12 renders); 3,004 glyphcss tests green.

---

## Ranked next steps

### 1. Frustum rejection before projection — **measured, worth building**

Every polygon in a visible BSP leaf is projected before being rejected. Direct
instrumentation of the projection loop over 12 poses:

```
polygons entering projection : 13,256
  wholly behind camera       :  3,983  (30.0%)
  projected then off-grid    :  3,605  (27.2%)
  actually on screen         :  5,668  (42.8%)

REJECTABLE BEFORE PROJECTION : 57.2%
```

**57% of projection work is waste**, against `base-raster` (1.61 ms). Codex's
abandon-threshold was 30%; this clears it.

Build it as hierarchical AABB batches per BSP leaf tested against the exact
frustum. **Fidelity traps:** near-plane-intersecting boxes must always be
accepted (glyphcss's clipping stays authoritative), and original polygon order
must be preserved — `depthEpsilon` deliberately resolves coplanar ties by draw
order, so reordering changes pixels.

### 2. Cache immutable render preparation — P1/P2, unmeasured

Every render rebuilds `allPolygons`, global indexes, mesh ids, shadow flags and
depth biases, though the world geometry is static (`createGlyphScene.ts:925`).
Cache per-mesh prepared segments, invalidated on transform/polygon change.
Estimated 0.2–0.7 ms. Caveat: `polygon.hidden` is mutated through shared
references by the PVS cull and must keep working.

### 3. Per-mesh shade invalidation — P3, glyphcss-side

The per-frame weapon transform calls `invalidateShading()`, discarding the
*scene-wide* shade cache every frame. In Quake it therefore never survives.

### 4. Fuse the atlas grid passes — P2

`isGlyphAtlasEncodable` walks the whole grid, then `encodeCellGridAtlas` walks it
again; `histogramGridColors` calls `packHexColor` (regex + parseInt on a string)
**per cell per frame** while the memo pattern for exactly this already exists in
the codebase (`packColorCached`). Bounded ~0.1–0.3 ms.

---

## Dead ends (closed with evidence)

- **Quadrant / dirty-region updates.** `commit-write` — the actual `<pre>` text
  assignment — is **0.09 ms/frame**. Splitting the grid could only attack that,
  and with a moving first-person camera essentially every cell changes anyway.
- **CSS compositor levers.** `contain:strict`, `contain:paint`, `will-change`,
  `translateZ(0)`, `content-visibility`, `text-rendering:optimizeSpeed` — all
  eight variants within noise of baseline (10.84–11.42 ms vs 10.99).
- **Entity detail density.** `glyphEntityDensity` 1 vs 2 changed `base-raster` by
  2% (6.04 vs 6.16 ms).
- **Atlas vs spans encoding.** A wash at the 20k budget (10.97 vs 11.14 task).
  Note atlas quantizes colour to 30 slots — a small real fidelity cost — so
  `spans` is arguably the better default on fidelity grounds alone.
- **`detail-project` firing 1,213×/frame.** Not a defect: the marker sits inside
  a per-vertex loop, so the count is vertices × renders.

---

## Method notes — measurement traps hit along the way

Each of these produced a confidently wrong number before being caught:

1. **`viewUrl()` returns Quake units; `setPose()` takes poly-frame units.**
   Mixing them flung the camera outside the map and rendered 0 non-blank cells
   while reporting healthy fps. `setViewpos` is the Quake-unit API. The harness
   now asserts a non-blank ratio before any number counts.
2. **Headless software-renders.** It inflated raster ~32× (4.2 vs 0.13 ms) and
   nearly produced a "raster-bound" conclusion. Paint questions need `--headed`.
3. **Phase attribution by gap-to-next-marker** swallowed idle time and produced a
   6.17 ms phase inside a 5.01 ms script budget. Bursts must be grouped from
   `base-validate`.
4. **Screenshot digests are not reproducible here** — different hash every run on
   a byte-identical DOM, through all three plausible fixes. That is rasterizer
   noise; the DOM digest is the gate.
5. **Vite's pre-bundled dep cache** silently served a stale glyphcss build after a
   library rebuild.

---

## Council provenance

- **fable** (Agent, deepest reasoning) — confirmed and *sharpened* the redundant-
  render diagnosis: identified the weapon viewmodel as the dominant contributor,
  proved staging must be inside `renderFrame` (2.01 vs 1.0 renders/frame), and
  corrected the `detail-project` false alarm. Mutation-checked live.
- **codex** (read-only sandbox, complete report) — independently reached the same
  P0, and supplied the frustum-rejection and render-preparation proposals with
  file:line evidence and the draw-order fidelity trap.
- **grok** — truncated after its opening sentence (379 bytes, no sentinel). Known
  failure mode on large packets; no findings.
- **agy** — dead seat. Headless mode auto-denied the `command` permission it
  cannot prompt for; produced no output.

Two of four seats completed. The verdict is correspondingly narrower than a full
council, and the two live findings were verified independently before landing.
