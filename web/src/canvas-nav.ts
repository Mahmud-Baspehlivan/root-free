// Moving around the tree canvas: drag to pan, pinch / Ctrl+wheel / buttons to zoom.

import { el, ui } from "./state.ts";
import { updateCanvasSize } from "./tree-view.ts";

const ZOOM_MIN = 0.2,
  ZOOM_MAX = 2;

// Click and drag on empty canvas space scrolls the view, like a map.
// Touch screens keep their native one-finger scrolling.
export function initCanvasPan(): void {
  const wrap = el("view-canvas");
  let pan: { id: number; x: number; y: number; left: number; top: number } | null = null;
  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    if ((e.target as Element).closest(".person-card, button, input, a")) return;
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add("panning");
    e.preventDefault();
  });
  wrap.addEventListener("pointermove", (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    wrap.scrollLeft = pan.left - (e.clientX - pan.x);
    wrap.scrollTop = pan.top - (e.clientY - pan.y);
  });
  const endPan = (e: PointerEvent) => {
    if (!pan || e.pointerId !== pan.id) return;
    pan = null;
    wrap.classList.remove("panning");
  };
  wrap.addEventListener("pointerup", endPan);
  wrap.addEventListener("pointercancel", endPan);
}

// Safari's non-standard gesture events (trackpad pinch on a Mac).
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

// Zoom the way maps and design tools do: trackpad pinch or Ctrl/⌘ + mouse
// wheel on a computer, two-finger pinch on a touch screen. A plain wheel or
// two-finger swipe still scrolls. The browser's own page zoom is kept off the
// tree, so the toolbar keeps its size.
export function initCanvasZoom(): void {
  const wrap = el("view-canvas");
  // Chrome, Edge and Firefox report a trackpad pinch as a wheel event with
  // ctrlKey set; a mouse wheel with Ctrl or ⌘ held arrives the same way.
  wrap.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
      const step = Math.max(-60, Math.min(60, dy));
      zoomTo(ui.zoom * Math.exp(-step * 0.004), e.clientX, e.clientY);
    },
    { passive: false },
  );

  // Two-finger pinch on a touch screen; moving the fingers also pans.
  let pinch: { d: number; z: number; tx: number; ty: number } | null = null;
  const centre = (t: TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });
  const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  wrap.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 2) return;
      const r = wrap.getBoundingClientRect();
      const c = centre(e.touches);
      pinch = {
        d: spread(e.touches) || 1,
        z: ui.zoom,
        tx: (c.x - r.left + wrap.scrollLeft) / ui.zoom,
        ty: (c.y - r.top + wrap.scrollTop) / ui.zoom,
      };
    },
    { passive: true },
  );
  wrap.addEventListener(
    "touchmove",
    (e) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const c = centre(e.touches);
      zoomTo((pinch.z * spread(e.touches)) / pinch.d, c.x, c.y, pinch.tx, pinch.ty);
    },
    { passive: false },
  );
  const endPinch = (e: TouchEvent) => {
    if (e.touches.length < 2) pinch = null;
  };
  wrap.addEventListener("touchend", endPinch);
  wrap.addEventListener("touchcancel", endPinch);

  // Safari: a trackpad pinch on a Mac arrives as gesture events. On an iPhone
  // the touch handlers above do the work, so there they only block page zoom.
  let gestureZoom: number | null = null;
  wrap.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    gestureZoom = pinch ? null : ui.zoom;
  });
  wrap.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    const g = e as GestureEvent;
    if (gestureZoom !== null && !pinch) zoomTo(gestureZoom * g.scale, g.clientX, g.clientY);
  });
  wrap.addEventListener("gestureend", (e) => {
    e.preventDefault();
    gestureZoom = null;
  });
}

// The buttons zoom around the middle of the visible area.
export function zoomIn(): void {
  zoomTo(ui.zoom * 1.2);
}
export function zoomOut(): void {
  zoomTo(ui.zoom / 1.2);
}
export function resetZoom(): void {
  zoomTo(1);
}

// Zoom so the tree point under (clientX, clientY) stays under it, like a map.
// A pinch passes the tree point it started on, so moving the fingers also pans.
export function zoomTo(z: number, clientX?: number, clientY?: number, treeX?: number, treeY?: number): void {
  const wrap = el("view-canvas");
  const r = wrap.getBoundingClientRect();
  const vx = (clientX ?? r.left + wrap.clientWidth / 2) - r.left;
  const vy = (clientY ?? r.top + wrap.clientHeight / 2) - r.top;
  const tx = treeX ?? (vx + wrap.scrollLeft) / ui.zoom;
  const ty = treeY ?? (vy + wrap.scrollTop) / ui.zoom;
  ui.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  updateCanvasSize();
  wrap.scrollLeft = tx * ui.zoom - vx;
  wrap.scrollTop = ty * ui.zoom - vy;
}

export function applyZoom(): void {
  const c = el("tree-canvas");
  c.style.transform = `scale(${ui.zoom})`;
  c.style.transformOrigin = "top left";
  // The scrollable box takes the zoomed size of the tree.
  const box = el("zoom-box");
  box.style.width = c.offsetWidth * ui.zoom + "px";
  box.style.height = c.offsetHeight * ui.zoom + "px";
  // The grid grows and shrinks with the tree.
  const g = 40 * ui.zoom + "px";
  el("view-canvas").style.backgroundSize = g + " " + g;
}
