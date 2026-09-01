import { BASE_TILE } from "glyphcss";

export const QUAKE_RENDER_SUPERSAMPLE = 1;
export const QUAKE_UNIT_SCALE = QUAKE_RENDER_SUPERSAMPLE / BASE_TILE;

export const renderDistanceToWorld = (value) => value / BASE_TILE;
export const worldDistanceToRender = (value) => value * BASE_TILE;
export const worldPositionToRender = ([x, y, z]) => [y * BASE_TILE, x * BASE_TILE, z * BASE_TILE];
