/**
 * The readouts' quiet ground, baked into a derived digit sheet.
 *
 * ── Why not contour occlusion ────────────────────────────────────────────────
 * The obvious tool for "padding around the background image" is the contour
 * claim the menus use (`occlusionMarginPx` -> glyphcss `occlusionContourPx`),
 * and it does NOT work here. Read in glyphcss 0.1.6: the id-map is genuinely
 * cross-mesh — a claimed cell is blanked from every other layer, not just the
 * base grid — but the contour MARGIN stamp only overwrites fine cells whose
 * current owner is the base grid or nothing:
 *
 *     (X === baseId || X === -1) && (w[H] = mesh.id)
 *
 * `hud-base.png` is fully opaque (measured: alpha 255 on every texel, no
 * sub-8 alpha anywhere), so glyphcss attaches no alpha sampler to it and the
 * bar claims its ENTIRE footprint. Every fine cell around a digit is already
 * owned by `hud-bar`, so a margin on `hud-art` stamps over nothing at all.
 * Giving the bar a contour too does not help either: the fine-to-output
 * reduce picks the contour mesh with the most fine coverage, and the bar
 * covers every subcell.
 *
 * ── What does work ───────────────────────────────────────────────────────────
 * Move the margin into the ART, where the claim raster already reads it. The
 * digit sheet's alpha is BINARY (measured: 37.9% opaque, zero partial texels),
 * so dilating that alpha by a few source texels and filling the new texels
 * with BLACK gives the digit mesh:
 *
 *   - a claim that follows the glyph contour outward by the margin — the
 *     texel-level claim rejection (`_.a <= 8 -> continue`) accepts the halo,
 *     the digit is nearer than the bar, so the bar is blanked there; and
 *   - nothing painted in the halo — a black texel rasters to ramp index 0,
 *     a space, so the cell falls through to the bar's own opaque backing
 *     (`QUAKE_HUD_BACKGROUND`) rather than to bar texture.
 *
 * The result is a ground that follows the digit shapes, which is the whole
 * point: a rectangular plate behind each readout was already rejected on the
 * menus, and `occlusionClaim: "geometry"` here would be exactly that plate.
 *
 * The claim is still quantized to the id-map's base cells, so the margin
 * decides which borderline base cells flip, not a pixel-exact outline —
 * the same hard floor the menu contour claims live with.
 */

/** Alpha at or below which a source texel counts as empty (glyphcss's own
 *  threshold, and the segmenter's). */
export const QUAKE_HUD_GROUND_ALPHA_MIN = 8;

/** Widest margin the builder will honour, in SOURCE texels. A digit cell is
 *  24 texels, so past this the halos of neighbouring digits meet and the
 *  readout reads as one dark slab instead of three numbers. */
export const QUAKE_HUD_GROUND_MAX_TEXELS = 6;

/** Mutable RGBA image, as `ImageData` presents one. */
export interface QuakeHudGroundImage {
  readonly data: Uint8ClampedArray | number[];
  readonly width: number;
  readonly height: number;
}

/**
 * Dilate `image`'s alpha outward by `marginTexels`, filling every newly
 * opaque texel with black — the ground the readouts sit on. In place.
 *
 * `frameWidth` is the sheet's sprite pitch (24 for the digit sheets): the
 * halo never crosses a frame boundary, so digit 3's ground can never appear
 * as a stray blot at the edge of digit 4's cell when the overlay draws that
 * frame's UV window. Consequently, source ink touching a frame edge has no
 * outward ground on that side: preserving strict frame ownership takes
 * precedence over a complete halo at the sheet's packed-frame boundaries.
 *
 * Returns the number of texels turned into ground (0 when the margin rounds
 * away, which leaves the sheet byte-identical to its source).
 */
export function applyQuakeHudReadoutGround(
  image: QuakeHudGroundImage,
  marginTexels: number,
  frameWidth: number,
): number {
  const margin = Math.min(QUAKE_HUD_GROUND_MAX_TEXELS, Math.max(0, marginTexels));
  if (!(margin > 0)) return 0;
  const { width, height } = image;
  const d = image.data;
  const pitch = frameWidth > 0 ? Math.floor(frameWidth) : width;

  // Snapshot the source alpha: the dilation must grow from the ORIGINAL ink,
  // never from ground it just wrote (which would run away across the frame).
  const opaque = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    opaque[i] = (d[i * 4 + 3] ?? 0) > QUAKE_HUD_GROUND_ALPHA_MIN ? 1 : 0;
  }

  const radius = Math.ceil(margin);
  const marginSq = margin * margin;
  let filled = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (opaque[index]) continue;
      const frame = Math.floor(x / pitch);
      let hit = false;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > marginSq) continue;
          const sx = x + dx;
          if (sx < 0 || sx >= width) continue;
          // Same frame only — see `frameWidth` above.
          if (Math.floor(sx / pitch) !== frame) continue;
          if (opaque[sy * width + sx]) { hit = true; break; }
        }
      }
      if (!hit) continue;
      d[index * 4] = 0;
      d[index * 4 + 1] = 0;
      d[index * 4 + 2] = 0;
      d[index * 4 + 3] = 255;
      filled++;
    }
  }
  return filled;
}
