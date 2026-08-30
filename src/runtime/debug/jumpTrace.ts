/**
 * Teleport tracer — `?trace=<collector-origin>`.
 *
 * Built because the phone kept dropping off USB mid-session, so the trace has to
 * reach the developer over the LAN instead of a devtools bridge. The player just
 * plays; every discontinuity in the camera path is POSTed with the surrounding
 * ring buffer, so the frames BEFORE the jump are what gets inspected rather than
 * a screenshot of the aftermath.
 *
 * Off unless the flag is present: no sampling, no timer, no listeners.
 */
export interface QuakeJumpTraceOptions {
  /** Where to POST, e.g. `http://192.168.178.39:5300`. */
  readonly collector: string;
  /** Reads the live eye position and angles: `[x, y, z, rotX, rotY]`. */
  readonly readEye: () => number[] | null;
}

/** Frames kept either side of a flagged jump. */
const RING = 90;
/**
 * POLY-frame units per frame that count as a teleport.
 *
 * `__debugEye` reports the poly frame, NOT Quake units — `BASE_TILE = 50`, so
 * one poly unit is 50 Quake units. The first version of this used 60, which is
 * 3,000 Quake units (about the whole map) and could never fire, which is why an
 * obviously-jumping session produced zero events.
 *
 * Quake run speed is ~320 Quake units/sec = ~5.3 per 60Hz frame = ~0.107 poly
 * units. 0.6 is ~6x that: far beyond walking, well under a level change.
 */
const JUMP_UNITS = 0.6;

export function startQuakeJumpTrace(options: QuakeJumpTraceOptions): () => void {
  const ring: { t: number; eye: number[] }[] = [];
  let previous: number[] | null = null;
  let frame = 0;
  let reported = 0;
  let stopped = false;

  const post = (payload: unknown) => {
    void fetch(`${options.collector}/trace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* collector down: tracing must never break play */ });
  };

  const sample = () => {
    if (stopped) return;
    frame = requestAnimationFrame(sample);
    const eye = options.readEye();
    if (!eye) return;
    const now = performance.now();
    ring.push({ t: Math.round(now), eye: eye.map((n) => Math.round(n * 100) / 100) });
    if (ring.length > RING * 2) ring.splice(0, ring.length - RING * 2);

    if (previous) {
      const dx = eye[0] - previous[0];
      const dy = eye[1] - previous[1];
      const dz = eye[2] - previous[2];
      const moved = Math.hypot(dx, dy, dz);
      if (moved > JUMP_UNITS && reported < 20) {
        reported++;
        post({
          kind: "teleport",
          movedUnits: Math.round(moved),
          from: previous.map((n) => Math.round(n * 100) / 100),
          to: eye.map((n) => Math.round(n * 100) / 100),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          fullscreen: !!document.fullscreenElement,
          before: ring.slice(-RING),
        });
      }
    }
    previous = [...eye];
  };

  frame = requestAnimationFrame(sample);
  post({ kind: "start", viewport: `${window.innerWidth}x${window.innerHeight}`, ua: navigator.userAgent.slice(0, 90) });

  return () => { stopped = true; cancelAnimationFrame(frame); };
}
