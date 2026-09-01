const FPS_SAMPLE_MS = 1000;
const MS_SAMPLE_MS = 500;
const GRAPH_COLUMNS = 20;
const SPARK = " .:-=+*#%@";

export function mountQuakeStatsOverlay(root: HTMLElement): () => void {
  document.querySelector(".dn-stats-overlay")?.remove();
  const output = document.createElement("pre");
  output.className = "dn-stats-overlay";
  output.setAttribute("aria-hidden", "true");
  output.style.cssText =
    "position:fixed;right:4px;bottom:clamp(4px,calc(602px - 50vw),88px);z-index:40;" +
    "margin:0;padding:4px;background:#050302;color:#a98c3f;" +
    "font:bold 9px/1.25 ui-monospace,monospace;pointer-events:none";
  root.appendChild(output);

  const fpsHistory: number[] = [];
  const msHistory: number[] = [];
  let fps = 0;
  let maxFrameMs = 0;
  let lastFrame = performance.now();
  let fpsSampleStart = lastFrame;
  let msSampleStart = lastFrame;
  let fpsFrameCount = 0;
  let animationFrame = 0;
  let disposed = false;

  function draw(): void {
    output.textContent =
      `${Math.round(fps).toString().padStart(3)} FPS ${sparkline(fpsHistory, 100)}\n` +
      `${Math.round(maxFrameMs).toString().padStart(3)} MS  ${sparkline(msHistory, 200)}`;
  }

  function tick(now: number): void {
    if (disposed) return;
    const frameMs = Math.max(0, now - lastFrame);
    lastFrame = now;
    fpsFrameCount++;
    maxFrameMs = Math.max(maxFrameMs, frameMs);

    if (now - msSampleStart >= MS_SAMPLE_MS) {
      pushSample(msHistory, maxFrameMs);
      msSampleStart = now;
    }
    const fpsElapsed = now - fpsSampleStart;
    if (fpsElapsed >= FPS_SAMPLE_MS) {
      fps = (fpsFrameCount * 1000) / fpsElapsed;
      pushSample(fpsHistory, fps);
      fpsSampleStart = now;
      fpsFrameCount = 0;
      maxFrameMs = 0;
    }
    draw();
    animationFrame = window.requestAnimationFrame(tick);
  }

  draw();
  animationFrame = window.requestAnimationFrame(tick);
  return () => {
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    output.remove();
  };
}

function pushSample(history: number[], value: number): void {
  history.push(Math.max(0, value));
  while (history.length > GRAPH_COLUMNS) history.shift();
}

function sparkline(history: number[], max: number): string {
  const empty = " ".repeat(Math.max(0, GRAPH_COLUMNS - history.length));
  return empty + history.map((value) => {
    const index = Math.min(SPARK.length - 1, Math.round((Math.min(max, value) / max) * (SPARK.length - 1)));
    return SPARK[index];
  }).join("");
}
