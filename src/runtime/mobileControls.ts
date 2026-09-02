import { markQuakeTrace } from "./debug/traceMarks";

export const QUAKE_MOBILE_CONTROLS_QUERY =
  "(any-pointer: coarse), (max-width: 960px)";

const QUAKE_MOBILE_MOVE_ZONE_SIZE = 144;
const QUAKE_MOBILE_STICK_SIZE = 108;
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
    if (attached) return;
    attached = true;
    media.addEventListener("change", syncAvailability);
    syncAvailability();
  }

  function dispose(): void {
    if (attached) {
      media.removeEventListener("change", syncAvailability);
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
      /* unsupported or OS-locked — portrait stays playable */
    }
  }

  /**
   * ANY touch triggers the rotation, not a touch on the controls.
   *
   * Gating on the control surface never fired: the controls are `display: none`
   * while a menu is open or the game is paused, which is the state the app boots
   * into — so on a fresh load there was nothing to touch and it stayed portrait.
   * The first tap on the menu is both the earliest legal gesture and the one the
   * player actually makes, so the rotation lands before gameplay, not after.
   */
  /**
   * Last real touch point, in client coordinates.
   *
   * MEASURED on a Galaxy S23: this browser delivers PointerEvents whose
   * `clientX`/`clientY` — and `pageX/Y` and `screenX/Y` — are ALL ZERO, while
   * the TouchEvents for the same gesture carry correct coordinates:
   *
   *   touchstart  touches[0] = [98, 227]   <- right
   *   pointerdown clientX/Y  = [0, 0]      <- wrong
   *
   * The event still targets the correct element, so only the coordinates are
   * lost. Reading 0 made the joystick anchor at the page origin, which is the
   * "stick jumps to the top-left corner" bug. Touch listeners run in the capture
   * phase and are passive, so they see the gesture before any pointer handler
   * and never block scrolling.
   */
  let lookAnchorPending = false;
  /**
   * Every ACTIVE touch, keyed by its identifier — not a single global point.
   *
   * The first version of this kept one `lastTouch`, taken from `touches[0]`.
   * That broke MULTI-TOUCH: with a thumb on the stick and a thumb dragging to
   * look, both handlers read the same finger, so moving and looking at once was
   * impossible. Keeping every touch and choosing the one inside the asking
   * zone's rect keeps the two gestures independent.
   */
  const activeTouches = new Map<number, { x: number; y: number }>();

  function recordTouchPoint(event: TouchEvent): void {
    for (const touch of Array.from(event.touches)) {
      activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
    // `touches` omits lifted fingers, so prune anything no longer present.
    const live = new Set(Array.from(event.touches, (t) => t.identifier));
    for (const id of [...activeTouches.keys()]) if (!live.has(id)) activeTouches.delete(id);
  }

  function clearTouchPoints(event: TouchEvent): void {
    for (const touch of Array.from(event.changedTouches)) activeTouches.delete(touch.identifier);
  }

  /**
   * Client coordinates for a pointer event, falling back to the touch that lies
   * inside `zone` when the pointer's own coordinates are the zeroed pair this
   * browser produces (measured on a Galaxy S23: `clientX/Y`, `pageX/Y` and
   * `screenX/Y` all 0, while the TouchEvents for the same gesture are correct).
   *
   * Both exactly 0 is the tell — a real touch inside a control zone can never
   * land on the page origin, since every zone is inset from the edges. Matching
   * by zone rather than by index is what makes two simultaneous gestures work.
   */
  function pointerPoint(event: PointerEvent, zone?: HTMLElement | null): { x: number; y: number } {
    if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY };
    const rect = zone?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      for (const point of activeTouches.values()) {
        if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
          return point;
        }
      }
    }
    const first = activeTouches.values().next();
    return first.done ? { x: event.clientX, y: event.clientY } : first.value;
  }

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
    document.addEventListener("touchstart", recordTouchPoint, { capture: true, passive: true });
    document.addEventListener("touchmove", recordTouchPoint, { capture: true, passive: true });
    document.addEventListener("touchend", clearTouchPoints, { capture: true, passive: true });
    document.addEventListener("touchcancel", clearTouchPoints, { capture: true, passive: true });

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
    document.removeEventListener("touchstart", recordTouchPoint, { capture: true });
    document.removeEventListener("touchmove", recordTouchPoint, { capture: true });
    document.removeEventListener("touchend", clearTouchPoints, { capture: true });
    document.removeEventListener("touchcancel", clearTouchPoints, { capture: true });
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
    // Do NOT anchor on pointerdown. When this browser zeroes pointer
    // coordinates the touch fallback still holds the PREVIOUS gesture's point
    // (pointerdown fires before touchstart, so nothing fresh exists yet), and
    // the first move then produced `current - stale` — one huge jump, which is
    // the "tap and drag again and the camera jumps" report: absolute instead of
    // incremental. The anchor is taken from the first MOVE instead, which always
    // carries a real coordinate, and that move emits no delta.
    lookAnchorPending = true;
    lookLastX = 0;
    lookLastY = 0;
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
    const lookNow = pointerPoint(event, lookZone);
    if (lookAnchorPending) {
      // First move of the gesture: establish the origin, emit nothing.
      lookAnchorPending = false;
      lookLastX = lookNow.x;
      lookLastY = lookNow.y;
      return;
    }
    const deltaX = lookNow.x - lookLastX;
    const deltaY = lookNow.y - lookLastY;
    lookLastX = lookNow.x;
    lookLastY = lookNow.y;
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
    const movePoint = pointerPoint(event, moveZone);
    setMoveInput((movePoint.x - moveAnchorX) / radius, (moveAnchorY - movePoint.y) / radius, phase);
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
    // FIXED stick, not a floating one. Anchoring on the touch point relocated
    // the whole control under the thumb, so touching anywhere near the drawn
    // ring teleported it — measured as a 36px jump on a 1px move, and reported
    // as "it jumps around". Anchoring on the zone's CENTRE keeps the ring where
    // it is drawn and moves only the knob, so the control stays where the player
    // expects it and the direction is simply (touch - centre).
    moveAnchorX = rect.left + rect.width / 2;
    moveAnchorY = rect.top + rect.height / 2;
    moveStickCenterX = rect.width / 2;
    moveStickCenterY = rect.height / 2;
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
    const front = moveStickFront;
    if (!stick || !front) return;
    stick.style.setProperty("--quake-mobile-stick-center-x", `${moveStickCenterX}px`);
    stick.style.setProperty("--quake-mobile-stick-center-y", `${moveStickCenterY}px`);
    stick.classList.toggle("quake-mobile-stick-active", active);
    front.style.setProperty("--quake-mobile-stick-travel-x", `${x * QUAKE_MOBILE_STICK_FRONT_TRAVEL}px`);
    front.style.setProperty("--quake-mobile-stick-travel-y", `${-y * QUAKE_MOBILE_STICK_FRONT_TRAVEL}px`);
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
