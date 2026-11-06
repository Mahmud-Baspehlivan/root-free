// Click-and-drag on empty canvas space scrolls the view, like a map.
// Touch devices keep their native scrolling, so only mouse/pen pan here.
function initCanvasPan() {
  const wrap = document.getElementById("view-canvas");
  let pan = null;
  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    if (e.target.closest(".person-card, button, input, a")) return;
    pan = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: wrap.scrollLeft,
      top: wrap.scrollTop,
    };
    wrap.setPointerCapture(e.pointerId);
    wrap.classList.add("panning");
    e.preventDefault();
  });
  wrap.addEventListener("pointermove", (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    wrap.scrollLeft = pan.left - (e.clientX - pan.x);
    wrap.scrollTop = pan.top - (e.clientY - pan.y);
  });
  const endPan = (e) => {
    if (!pan || e.pointerId !== pan.id) return;
    pan = null;
    wrap.classList.remove("panning");
  };
  wrap.addEventListener("pointerup", endPan);
  wrap.addEventListener("pointercancel", endPan);
  initCanvasZoom(wrap);
}

// Zoom the tree the way maps and design tools do: trackpad pinch or
// Ctrl/⌘ + mouse wheel on a computer, two-finger pinch on a phone. A
// plain wheel or two-finger swipe still scrolls. The browser's own page
// zoom is suppressed over the tree so the toolbar keeps its size.
function initCanvasZoom(wrap) {
  // Chrome, Edge and Firefox report a trackpad pinch as a wheel event
  // with ctrlKey set; a mouse wheel with Ctrl or ⌘ held arrives the same way.
  wrap.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
      const step = Math.max(-60, Math.min(60, dy));
      zoomTo(currentZoom * Math.exp(-step * 0.004), e.clientX, e.clientY);
    },
    { passive: false },
  );

  // Two-finger pinch on a touch screen.
  let pinch = null;
  const centre = (t) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });
  const spread = (t) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  wrap.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 2) return;
      const r = wrap.getBoundingClientRect();
      const c = centre(e.touches);
      pinch = {
        d: spread(e.touches) || 1,
        z: currentZoom,
        tx: (c.x - r.left + wrap.scrollLeft) / currentZoom,
        ty: (c.y - r.top + wrap.scrollTop) / currentZoom,
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
      zoomTo(
        (pinch.z * spread(e.touches)) / pinch.d,
        c.x,
        c.y,
        pinch.tx,
        pinch.ty,
      );
    },
    { passive: false },
  );
  const endPinch = (e) => {
    if (e.touches.length < 2) pinch = null;
  };
  wrap.addEventListener("touchend", endPinch);
  wrap.addEventListener("touchcancel", endPinch);

  // Safari: trackpad pinch on a Mac arrives as gesture events; on an
  // iPhone the touch handlers above do the work, so only block the page zoom.
  let gestureZoom = null;
  wrap.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    gestureZoom = pinch ? null : currentZoom;
  });
  wrap.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (gestureZoom !== null && !pinch)
      zoomTo(gestureZoom * e.scale, e.clientX, e.clientY);
  });
  wrap.addEventListener("gestureend", (e) => {
    e.preventDefault();
    gestureZoom = null;
  });
}


// ═══════════════════════════════════════
// ZOOM
// ═══════════════════════════════════════
const ZOOM_MIN = 0.2,
  ZOOM_MAX = 2;
// Buttons zoom around the middle of the visible area.
function zoomIn() {
  zoomTo(currentZoom * 1.2);
}
function zoomOut() {
  zoomTo(currentZoom / 1.2);
}
function resetZoom() {
  zoomTo(1);
}
// Zoom so the tree point under (clientX, clientY) stays under it, like
// a map. A pinch passes the tree point it started on, so moving the
// fingers also pans.
function zoomTo(z, clientX, clientY, treeX, treeY) {
  const wrap = document.getElementById("view-canvas");
  const r = wrap.getBoundingClientRect();
  if (clientX === undefined) {
    clientX = r.left + wrap.clientWidth / 2;
    clientY = r.top + wrap.clientHeight / 2;
  }
  const vx = clientX - r.left,
    vy = clientY - r.top;
  if (treeX === undefined) {
    treeX = (vx + wrap.scrollLeft) / currentZoom;
    treeY = (vy + wrap.scrollTop) / currentZoom;
  }
  currentZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  updateCanvasSize();
  wrap.scrollLeft = treeX * currentZoom - vx;
  wrap.scrollTop = treeY * currentZoom - vy;
}
function applyZoom() {
  const c = document.getElementById("tree-canvas");
  c.style.transform = `scale(${currentZoom})`;
  c.style.transformOrigin = "top left";
  const box = document.getElementById("zoom-box");
  box.style.width = c.offsetWidth * currentZoom + "px";
  box.style.height = c.offsetHeight * currentZoom + "px";
  // The grid grows and shrinks with the tree.
  const g = 40 * currentZoom + "px";
  document.getElementById("view-canvas").style.backgroundSize =
    g + " " + g;
}
