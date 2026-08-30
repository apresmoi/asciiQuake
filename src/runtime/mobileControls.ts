import { markQuakeTrace } from "./debug/traceMarks";

export const QUAKE_MOBILE_CONTROLS_QUERY =
  "(any-pointer: coarse), (max-width: 960px)";

const QUAKE_MOBILE_MOVE_ZONE_SIZE = 144;
const QUAKE_MOBILE_STICK_SIZE = 108;
const QUAKE_MOBILE_STICK_FRONT_SIZE = 54;
const QUAKE_MOBILE_STICK_FRONT_TRAVEL = QUAKE_MOBILE_STICK_SIZE / 4;
const QUAKE_MOBILE_STICK_CENTER = QUAKE_MOBILE_MOVE_ZONE_SIZE / 2;

interface QuakeMobileControlsOptions {
  root: HTMLElement;
  moveDeadzone: number;
  moveDtClamp: number;
  canUseInput: () => boolean;
  isAttackDown: () => boolean;
  isDisposed: () => boolean;
  useMoveFrame: () => boolean;
  onAvailabilityChange: () => void;
  onMoveIntent: () => void;
  onAnalogMove: (x: number, y: number) => void;
  onMoveFrame: (dt: number, x: number, y: number) => void;
  onLookStart: (event: PointerEvent) => boolean;
  onLookDelta: (deltaX: number, deltaY: number, pointerId: number) => void;
  onFireDown: (event: PointerEvent) => boolean;
  onFireEnd: (event: PointerEvent) => void;
  onJump: (pressed: boolean) => void;
  onWeaponCycle: () => void;
}

export interface QuakeMobileControls {
  attach(): void;
  clearJumpInput(): void;
  clearLookInput(): void;
  clearMoveInput(): void;
  destroy(): void;
  dispose(): void;
  isAvailable(): boolean;
  isTarget(target: EventTarget | null): boolean;
  releaseFirePointerCapture(pointerId: number | null): void;
  setup(): void;
  syncAvailability(): void;
}

export function createQuakeMobileControls(options: QuakeMobileControlsOptions): QuakeMobileControls {
  const media = window.matchMedia(QUAKE_MOBILE_CONTROLS_QUERY);
  let root: HTMLElement | null = null;
  let moveZone: HTMLElement | null = null;
  let moveStick: HTMLElement | null = null;
  let moveStickBack: HTMLElement | null = null;
  let moveStickFront: HTMLElement | null = null;
  let lookZone: HTMLElement | null = null;
  let fireButton: HTMLButtonElement | null = null;
  let jumpButton: HTMLButtonElement | null = null;
  let weaponButton: HTMLButtonElement | null = null;
  let jumpPointerId: number | null = null;
  let moveFrame = 0;
  let moveTime = 0;
  let moveX = 0;
  let moveY = 0;
  let movePointerId: number | null = null;
  let moveAnchorX = 0;
  let moveAnchorY = 0;
  let moveStickCenterX = QUAKE_MOBILE_STICK_CENTER;
  let moveStickCenterY = QUAKE_MOBILE_STICK_CENTER;
  let moveStartedAt = 0;
  let moveSampleCount = 0;
  let lookPointerId: number | null = null;
  let lookLastX = 0;
  let lookLastY = 0;
  let lookMoveCount = 0;
  let lookStartedAt = 0;
  let fireStartedAt = 0;
  let attached = false;

  function attach(): void {
    window.addEventListener("resize", applyLandscapeFallback);
    window.addEventListener("orientationchange", applyLandscapeFallback);
    if (attached) return;
    attached = true;
    media.addEventListener("change", syncAvailability);
    syncAvailability();
  }

  function dispose(): void {
    if (attached) {
      media.removeEventListener("change", syncAvailability);
      window.removeEventListener("resize", applyLandscapeFallback);
      window.removeEventListener("orientationchange", applyLandscapeFallback);
      attached = false;
    }
    destroy();
  }

  function isAvailable(): boolean {
    return media.matches;
  }

  function isTarget(target: EventTarget | null): boolean {
    return target instanceof Node && root?.contains(target) === true;
  }

  function syncAvailability(): void {
    applyLandscapeFallback();
    if (media.matches) {
      setup();
    } else {
      destroy();
    }
    options.onAvailabilityChange();
  }

  /**
   * Go fullscreen and lock landscape on the first touch of the controls.
   *
   * A page cannot rotate the device on its own, and a phone with auto-rotate
   * off simply stays portrait — measured on a real S23: `screen.orientation`
   * reported `portrait-primary` at 411x742 while the world rendered fine, so
   * the only thing missing was the orientation itself. Both APIs require a
   * user gesture and `lock()` requires fullscreen, so the first press on the
   * control surface is the earliest legal moment.
   *
   * Best-effort by design: `lock()` is unsupported on iOS Safari and rejects
   * on a device whose rotation is locked at the OS level. It must never throw
   * into the input path — a failed rotation still leaves a playable portrait
   * screen, which is why the rotate hint stays as the fallback.
   */
  let orientationLocked = false;
  async function requestLandscape(): Promise<void> {
    // Only latch on SUCCESS. Latching on the attempt meant one silent failure
    // disabled rotation for the whole session.
    if (orientationLocked) return;
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" });
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      await orientation?.lock?.("landscape");
      orientationLocked = true;
    } catch {
      /* fall through to the CSS rotation below */
    }
    // FALLBACK: present landscape even when the real thing is unavailable.
    // `orientation.lock()` needs fullscreen, is unsupported on iOS Safari, and
    // rejects outright when the OS rotation lock is on — measured on a real S23,
    // where the page sat in portrait-primary with the world rendering fine. When
    // the lock does not take, rotate the app ourselves so the player still gets a
    // wide view. `getBoundingClientRect()` reports post-transform boxes, so glyph
    // hotspots and the touch controls keep hit-testing correctly.
    applyLandscapeFallback();
  }

  /** True once the CSS rotation is standing in for a real orientation lock. */
  let landscapeFallbackApplied = false;

  function applyLandscapeFallback(): void {
    const portrait = window.innerHeight > window.innerWidth;
    const wanted = !orientationLocked && portrait && media.matches;
    if (wanted === landscapeFallbackApplied) return;
    landscapeFallbackApplied = wanted;
    document.body.classList.toggle("quake-force-landscape", wanted);
    options.onAvailabilityChange();
  }

  /**
   * Any touch anywhere is the trigger, NOT a touch on the controls.
   *
   * Gating this on the control surface never fired: the controls are
   * `display: none` while a menu is open or the game is paused, which is the
   * state the app starts in — so on a fresh load there was nothing to touch and
   * the app stayed portrait. The first tap on the menu ("single player", "new
   * game") is both the earliest user gesture available and the one the player
   * actually makes, so the rotation happens before gameplay rather than after.
   */
  function onFirstControlTouch(event: PointerEvent): void {
    if (event.pointerType === "mouse") return;
    if (!media.matches) return;
    void requestLandscape();
  }

  function setup(): void {
    if (root) return;
    const controlsRoot = document.createElement("div");
    controlsRoot.id = "quake-mobile-controls";
    controlsRoot.setAttribute("aria-hidden", "true");
    // Listen on the DOCUMENT in the CAPTURE phase, not on the root: the root is
    // `pointer-events: none` (taps fall through to the game) and the buttons stop
    // propagation, so a bubble-phase listener here never fired — measured on a
    // real S23, where fullscreen therefore never happened and the subsequent
    // `orientation.lock()` failed with "The page needs to be fullscreen".
    document.addEventListener("pointerdown", onFirstControlTouch, { capture: true });

    const nextLookZone = document.createElement("div");
    nextLookZone.id = "quake-mobile-look-zone";

    const nextMoveZone = document.createElement("div");
    nextMoveZone.id = "quake-mobile-move-zone";
    const nextMoveStick = document.createElement("div");
    nextMoveStick.className = "joystick";
    const nextMoveStickBack = document.createElement("div");
    nextMoveStickBack.className = "back";
    const nextMoveStickFront = document.createElement("div");
    nextMoveStickFront.className = "front";
    nextMoveStick.append(nextMoveStickBack, nextMoveStickFront);
    nextMoveZone.append(nextMoveStick);

    const nextFireButton = document.createElement("button");
    nextFireButton.id = "quake-mobile-fire";
    nextFireButton.type = "button";
    nextFireButton.setAttribute("aria-label", "Fire");

    // Quake needs more verbs than footlol's move/actions pair: jump and a
    // weapon cycle join the fire button in the right-hand cluster.
    const nextJumpButton = document.createElement("button");
    nextJumpButton.id = "quake-mobile-jump";
    nextJumpButton.type = "button";
    nextJumpButton.setAttribute("aria-label", "Jump");
    nextJumpButton.textContent = "JUMP";

    const nextWeaponButton = document.createElement("button");
    nextWeaponButton.id = "quake-mobile-weapon";
    nextWeaponButton.type = "button";
    nextWeaponButton.setAttribute("aria-label", "Next weapon");
    nextWeaponButton.textContent = "GUN>";

    // Rotate hint (footlol's RotateOverlay, non-blocking): CSS shows it in
    // portrait and fades it out — no JS state, no orientation listener.
    const rotateHint = document.createElement("div");
    rotateHint.id = "quake-mobile-rotate-hint";
    rotateHint.textContent = "ROTATE FOR A WIDER VIEW";

    controlsRoot.append(nextLookZone, nextMoveZone, nextFireButton, nextJumpButton, nextWeaponButton, rotateHint);
    options.root.append(controlsRoot);

    root = controlsRoot;
    lookZone = nextLookZone;
    moveZone = nextMoveZone;
    moveStick = nextMoveStick;
    moveStickBack = nextMoveStickBack;
    moveStickFront = nextMoveStickFront;
    fireButton = nextFireButton;
    jumpButton = nextJumpButton;
    weaponButton = nextWeaponButton;
    syncMoveStickVisual(0, 0, false);
    nextMoveZone.addEventListener("pointerdown", handleMovePointerDown);
    nextMoveZone.addEventListener("pointermove", handleMovePointerMove);
    nextMoveZone.addEventListener("pointerup", handleMovePointerEnd);
    nextMoveZone.addEventListener("pointercancel", handleMovePointerEnd);
    nextMoveZone.addEventListener("lostpointercapture", handleMovePointerEnd);
    nextLookZone.addEventListener("pointerdown", handleLookPointerDown);
    nextLookZone.addEventListener("pointermove", handleLookPointerMove);
    nextLookZone.addEventListener("pointerup", handleLookPointerEnd);
    nextLookZone.addEventListener("pointercancel", handleLookPointerEnd);
    nextLookZone.addEventListener("lostpointercapture", handleLookPointerEnd);
    nextFireButton.addEventListener("pointerdown", handleFirePointerDown);
    nextFireButton.addEventListener("pointerup", handleFirePointerEnd);
    nextFireButton.addEventListener("pointercancel", handleFirePointerEnd);
    nextFireButton.addEventListener("lostpointercapture", handleFirePointerEnd);
    nextJumpButton.addEventListener("pointerdown", handleJumpPointerDown);
    nextJumpButton.addEventListener("pointerup", handleJumpPointerEnd);
    nextJumpButton.addEventListener("pointercancel", handleJumpPointerEnd);
    nextJumpButton.addEventListener("lostpointercapture", handleJumpPointerEnd);
    nextWeaponButton.addEventListener("pointerdown", handleWeaponPointerDown);
  }

  function destroy(): void {
    clearLookInput();
    clearMoveInput();
    document.removeEventListener("pointerdown", onFirstControlTouch, { capture: true });
    moveZone?.removeEventListener("pointerdown", handleMovePointerDown);
    moveZone?.removeEventListener("pointermove", handleMovePointerMove);
    moveZone?.removeEventListener("pointerup", handleMovePointerEnd);
    moveZone?.removeEventListener("pointercancel", handleMovePointerEnd);
    moveZone?.removeEventListener("lostpointercapture", handleMovePointerEnd);
    lookZone?.removeEventListener("pointerdown", handleLookPointerDown);
    lookZone?.removeEventListener("pointermove", handleLookPointerMove);
    lookZone?.removeEventListener("pointerup", handleLookPointerEnd);
    lookZone?.removeEventListener("pointercancel", handleLookPointerEnd);
    lookZone?.removeEventListener("lostpointercapture", handleLookPointerEnd);
    fireButton?.removeEventListener("pointerdown", handleFirePointerDown);
    fireButton?.removeEventListener("pointerup", handleFirePointerEnd);
    fireButton?.removeEventListener("pointercancel", handleFirePointerEnd);
    fireButton?.removeEventListener("lostpointercapture", handleFirePointerEnd);
    jumpButton?.removeEventListener("pointerdown", handleJumpPointerDown);
    jumpButton?.removeEventListener("pointerup", handleJumpPointerEnd);
    jumpButton?.removeEventListener("pointercancel", handleJumpPointerEnd);
    jumpButton?.removeEventListener("lostpointercapture", handleJumpPointerEnd);
    weaponButton?.removeEventListener("pointerdown", handleWeaponPointerDown);
    clearJumpInput();
    root?.remove();
    root = null;
    lookZone = null;
    moveZone = null;
    moveStick = null;
    moveStickBack = null;
    moveStickFront = null;
    fireButton = null;
    jumpButton = null;
    weaponButton = null;
  }

  function handleLookPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "look-button",
        target: "look",
      });
      return;
    }
    if (lookPointerId !== null) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "look-active",
        target: "look",
      });
      return;
    }
    if (!options.onLookStart(event)) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "look-cannot-input",
        target: "look",
      });
      return;
    }
    lookPointerId = event.pointerId;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
    lookMoveCount = 0;
    lookStartedAt = performance.now();
    const rect = lookZone?.getBoundingClientRect();
    markQuakeTrace("mobile-look-start", {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      zoneH: rect?.height,
      zoneW: rect?.width,
    });
    try {
      lookZone?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the pointer ended during the same frame.
    }
  }

  function handleLookPointerMove(event: PointerEvent): void {
    if (event.pointerId !== lookPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!options.canUseInput()) {
      clearLookInput();
      return;
    }
    const deltaX = event.clientX - lookLastX;
    const deltaY = event.clientY - lookLastY;
    lookLastX = event.clientX;
    lookLastY = event.clientY;
    lookMoveCount++;
    options.onLookDelta(deltaX, deltaY, event.pointerId);
  }

  function handleLookPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== lookPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    clearLookInput();
  }

  function clearLookInput(): void {
    const pointerId = lookPointerId;
    if (pointerId !== null) {
      markQuakeTrace("mobile-look-end", {
        durationMs: lookStartedAt ? performance.now() - lookStartedAt : 0,
        moveCount: lookMoveCount,
        pointerId,
      });
    }
    if (pointerId !== null && lookZone?.hasPointerCapture(pointerId)) {
      try {
        lookZone.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture on pointer cancellation.
      }
    }
    lookPointerId = null;
    lookLastX = 0;
    lookLastY = 0;
    lookMoveCount = 0;
    lookStartedAt = 0;
  }

  function handleMovePointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "move-button",
        target: "move",
      });
      return;
    }
    if (movePointerId !== null) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "move-active",
        target: "move",
      });
      return;
    }
    if (!options.canUseInput()) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "move-cannot-input",
        target: "move",
      });
      return;
    }
    movePointerId = event.pointerId;
    moveStartedAt = performance.now();
    moveSampleCount = 0;
    markQuakeTrace("mobile-move-start", {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    if (!setMoveAnchor(event)) { movePointerId = null; return; }
    try {
      moveZone?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the pointer ended during the same frame.
    }
    handleMovePointerPosition(event, "start");
  }

  function handleMovePointerMove(event: PointerEvent): void {
    if (event.pointerId !== movePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    handleMovePointerPosition(event, "move");
  }

  function handleMovePointerEnd(event: PointerEvent): void {
    if (event.pointerId !== movePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    clearMoveInput("end");
  }

  function handleMovePointerPosition(event: PointerEvent, phase: "start" | "move"): void {
    if (!options.canUseInput()) {
      clearMoveInput("cannot-input");
      return;
    }
    const zone = moveZone;
    if (!zone) {
      clearMoveInput("missing-zone");
      return;
    }
    const rect = zone.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    if (radius <= 0) {
      clearMoveInput("missing-radius");
      return;
    }
    moveSampleCount++;
    setMoveInput((event.clientX - moveAnchorX) / radius, (moveAnchorY - event.clientY) / radius, phase);
  }

  function setMoveAnchor(event: PointerEvent): boolean {
    const rect = moveZone?.getBoundingClientRect();
    // A ZERO-SIZE zone must abort, never fall back. Measured on a real S23: the
    // controls root is `display: none` whenever the game is paused or a menu is
    // open, so the zone reports 0x0 at (0,0). The old fallback then pinned the
    // stick's centre to the zone origin, which is the "joystick jumps to the top
    // left corner" bug — and `radius` derived from the same rect was 0, so the
    // input was discarded as `missing-radius` and the stick never followed the
    // thumb at all.
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      markQuakeTrace("mobile-move-input", { source: "start", reason: "zero-zone", x: 0, y: 0 });
      return false;
    }
    moveAnchorX = event.clientX;
    moveAnchorY = event.clientY;
    moveStickCenterX = event.clientX - rect.left;
    moveStickCenterY = event.clientY - rect.top;
    syncMoveStickVisual(0, 0, true);
    return true;
  }

  function setMoveInput(x: number, y: number, source: "start" | "move"): void {
    const length = Math.hypot(x, y);
    if (length < options.moveDeadzone) {
      markQuakeTrace("mobile-move-input", {
        length,
        source,
        x,
        y,
      });
      syncMoveStickVisual(0, 0, true);
      clearMoveVector();
      return;
    }
    if (options.canUseInput()) options.onMoveIntent();
    const scale = length > 1 ? 1 / length : 1;
    moveX = x * scale;
    moveY = y * scale;
    syncMoveStickVisual(moveX, moveY, true);
    const rect = moveZone?.getBoundingClientRect();
    markQuakeTrace("mobile-move-input", {
      length: Math.hypot(moveX, moveY),
      source,
      x: moveX,
      y: moveY,
      zoneH: rect?.height,
      zoneW: rect?.width,
    });
    if (options.useMoveFrame()) {
      scheduleMoveFrame();
    } else {
      options.onAnalogMove(moveX, moveY);
    }
  }

  function clearMoveInput(reason = "end"): void {
    const pointerId = movePointerId;
    if (moveX || moveY) {
      markQuakeTrace("mobile-move-clear", {
        durationMs: moveStartedAt ? performance.now() - moveStartedAt : 0,
        lastX: moveX,
        lastY: moveY,
        pointerId,
        reason,
        sampleCount: moveSampleCount,
      });
    }
    if (pointerId !== null && moveZone?.hasPointerCapture(pointerId)) {
      try {
        moveZone.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture on pointer cancellation.
      }
    }
    movePointerId = null;
    moveAnchorX = 0;
    moveAnchorY = 0;
    moveX = 0;
    moveY = 0;
    moveTime = 0;
    moveStartedAt = 0;
    moveSampleCount = 0;
    moveStickCenterX = QUAKE_MOBILE_STICK_CENTER;
    moveStickCenterY = QUAKE_MOBILE_STICK_CENTER;
    syncMoveStickVisual(0, 0, false);
    options.onAnalogMove(0, 0);
    if (!moveFrame) return;
    window.cancelAnimationFrame(moveFrame);
    moveFrame = 0;
  }

  function clearMoveVector(): void {
    moveX = 0;
    moveY = 0;
    moveTime = 0;
    options.onAnalogMove(0, 0);
    if (!moveFrame) return;
    window.cancelAnimationFrame(moveFrame);
    moveFrame = 0;
  }

  function scheduleMoveFrame(): void {
    if (options.isDisposed() || moveFrame) return;
    if (Math.hypot(moveX, moveY) < options.moveDeadzone) return;
    moveFrame = window.requestAnimationFrame(runMoveFrame);
  }

  function runMoveFrame(now: number): void {
    moveFrame = 0;
    if (Math.hypot(moveX, moveY) < options.moveDeadzone) {
      moveTime = 0;
      return;
    }
    if (!options.canUseInput()) {
      clearMoveInput("cannot-input");
      return;
    }
    const dt = Math.min(options.moveDtClamp, moveTime ? (now - moveTime) / 1000 : 0.0167);
    options.onMoveFrame(dt, moveX, moveY);
    moveTime = now;
    scheduleMoveFrame();
  }

  function syncMoveStickVisual(x: number, y: number, active: boolean): void {
    const stick = moveStick;
    const back = moveStickBack;
    const front = moveStickFront;
    if (!stick || !back || !front) return;
    stick.style.position = "absolute";
    stick.style.display = "block";
    stick.style.left = `${moveStickCenterX}px`;
    stick.style.top = `${moveStickCenterY}px`;
    stick.style.width = `${QUAKE_MOBILE_STICK_SIZE}px`;
    stick.style.height = `${QUAKE_MOBILE_STICK_SIZE}px`;
    stick.style.marginLeft = `${-QUAKE_MOBILE_STICK_SIZE / 2}px`;
    stick.style.marginTop = `${-QUAKE_MOBILE_STICK_SIZE / 2}px`;
    stick.style.opacity = active ? "1" : "0.58";
    stick.style.touchAction = "none";
    stick.style.userSelect = "none";
    stick.style.pointerEvents = "none";
    stick.style.zIndex = "999";

    back.style.position = "absolute";
    back.style.display = "block";
    back.style.left = "0px";
    back.style.top = "0px";
    back.style.width = `${QUAKE_MOBILE_STICK_SIZE}px`;
    back.style.height = `${QUAKE_MOBILE_STICK_SIZE}px`;
    back.style.marginLeft = "0px";
    back.style.marginTop = "0px";
    back.style.borderRadius = "50%";
    back.style.background = "rgba(10, 9, 7, 0.34)";
    back.style.boxSizing = "border-box";
    back.style.border = "2px solid rgba(245, 232, 200, 0.42)";
    back.style.pointerEvents = "none";

    front.style.position = "absolute";
    front.style.display = "block";
    front.style.left = "50%";
    front.style.top = "50%";
    front.style.width = `${QUAKE_MOBILE_STICK_FRONT_SIZE}px`;
    front.style.height = `${QUAKE_MOBILE_STICK_FRONT_SIZE}px`;
    front.style.marginLeft = `${-QUAKE_MOBILE_STICK_FRONT_SIZE / 2}px`;
    front.style.marginTop = `${-QUAKE_MOBILE_STICK_FRONT_SIZE / 2}px`;
    front.style.borderRadius = "50%";
    front.style.background = "rgba(245, 232, 200, 0.18)";
    front.style.opacity = "0.5";
    front.style.boxSizing = "border-box";
    front.style.border = "2px solid rgba(245, 232, 200, 0.48)";
    front.style.pointerEvents = "none";
    front.style.transform = `translate(${x * QUAKE_MOBILE_STICK_FRONT_TRAVEL}px, ${-y * QUAKE_MOBILE_STICK_FRONT_TRAVEL}px)`;
  }

  function handleFirePointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "fire-button",
        target: "fire",
      });
      return;
    }
    if (!options.onFireDown(event)) {
      markQuakeTrace("mobile-pointer-conflict", {
        pointerId: event.pointerId,
        reason: "fire-cannot-input",
        target: "fire",
      });
      return;
    }
    fireStartedAt = performance.now();
    markQuakeTrace("mobile-fire-down", {
      accepted: true,
      attackDown: options.isAttackDown(),
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    try {
      fireButton?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the pointer ended during the same frame.
    }
  }

  function handleFirePointerEnd(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    options.onFireEnd(event);
    markQuakeTrace("mobile-fire-up", {
      attackDown: options.isAttackDown(),
      durationMs: fireStartedAt ? performance.now() - fireStartedAt : 0,
      pointerId: event.pointerId,
    });
    fireStartedAt = 0;
  }

  function handleJumpPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0 || jumpPointerId !== null) return;
    if (!options.canUseInput()) return;
    jumpPointerId = event.pointerId;
    options.onJump(true);
    markQuakeTrace("mobile-jump-down", { pointerId: event.pointerId });
    try {
      jumpButton?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the pointer ended during the same frame.
    }
  }

  function handleJumpPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== jumpPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    clearJumpInput();
  }

  function clearJumpInput(): void {
    const pointerId = jumpPointerId;
    if (pointerId === null) return;
    if (jumpButton?.hasPointerCapture(pointerId)) {
      try {
        jumpButton.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture on pointer cancellation.
      }
    }
    jumpPointerId = null;
    options.onJump(false);
    markQuakeTrace("mobile-jump-up", { pointerId });
  }

  function handleWeaponPointerDown(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) return;
    if (!options.canUseInput()) return;
    markQuakeTrace("mobile-weapon-cycle", { pointerId: event.pointerId });
    options.onWeaponCycle();
  }

  function releaseFirePointerCapture(pointerId: number | null): void {
    if (pointerId === null || !fireButton?.hasPointerCapture(pointerId)) return;
    try {
      fireButton.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released capture on pointer cancellation.
    }
  }

  return {
    attach,
    clearJumpInput,
    clearLookInput,
    clearMoveInput,
    destroy,
    dispose,
    isAvailable,
    isTarget,
    releaseFirePointerCapture,
    setup,
    syncAvailability,
  };
}
