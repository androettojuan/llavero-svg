// Vista 2D interactiva del raster cuantizado, con zoom (rueda) y paneo (arrastre).
// Clic corto = seleccionar la isla de color bajo el cursor (onPick).
// Aplica las ediciones (editMap) y resalta la seleccion pendiente.
import { useEffect, useRef } from "react";

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null;
}

// El color tecnico de fondo/transparencia es ~magenta; lo mostramos transparente.
function isMagentaish(rgb) {
  return rgb && Math.abs(rgb.r - 255) + rgb.g + Math.abs(rgb.b - 255) < 120;
}

export default function EraseCanvas({ raster, editMap, pending, onPick }) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const view = useRef({ scale: 1, tx: 0, ty: 0, base: 1 });
  const drag = useRef(null);

  function applyTransform() {
    const c = canvasRef.current;
    if (!c) return;
    const { scale, tx, ty } = view.current;
    c.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // Dibuja el raster con las ediciones aplicadas + resalta lo pendiente.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !raster) return;
    const { width: w, height: h, array, palette } = raster;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const pendingSet = pending ? new Set(pending) : null;

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        const o = idx * 4;
        const edit = editMap ? editMap.get(idx) : undefined;
        let rgb;
        if (edit === null) {
          img.data[o + 3] = 0;
          rgb = null;
        } else if (typeof edit === "string") {
          rgb = hexToRgb(edit);
        } else {
          rgb = palette[array[j + 1][i + 1]] || { r: 0, g: 0, b: 0 };
          if (isMagentaish(rgb)) rgb = null; // fondo -> transparente
        }
        if (rgb === null && edit !== null) img.data[o + 3] = 0;
        if (rgb) {
          img.data[o] = rgb.r;
          img.data[o + 1] = rgb.g;
          img.data[o + 2] = rgb.b;
          img.data[o + 3] = 255;
        }
        if (pendingSet && pendingSet.has(idx)) {
          img.data[o] = Math.round((img.data[o] + 255) / 2);
          img.data[o + 1] = Math.round((img.data[o + 1] + 240) / 2);
          img.data[o + 2] = Math.round(img.data[o + 2] / 2);
          img.data[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    applyTransform();
  }, [raster, editMap, pending]);

  // Encadrar (fit) y centrar cuando cambia la imagen.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !raster) return;
    const r = vp.getBoundingClientRect();
    const base = Math.min(r.width / raster.width, r.height / raster.height) || 1;
    view.current = {
      scale: base,
      base,
      tx: (r.width - raster.width * base) / 2,
      ty: (r.height - raster.height * base) / 2,
    };
    applyTransform();
  }, [raster]);

  // Zoom con la rueda, centrado en el cursor.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const { scale, tx, ty, base } = view.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = Math.min(base * 20, Math.max(base, scale * factor));
      view.current = {
        base,
        scale: next,
        tx: cx - ((cx - tx) / scale) * next,
        ty: cy - ((cy - ty) / scale) * next,
      };
      applyTransform();
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e) {
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    view.current.tx += dx;
    view.current.ty += dy;
    applyTransform();
  }
  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d || !raster) return;
    if (d.moved < 5) {
      // Clic: mapear a pixel usando el rect real del canvas (incluye transform).
      const rect = canvasRef.current.getBoundingClientRect();
      const px = Math.floor(((e.clientX - rect.left) / rect.width) * raster.width);
      const py = Math.floor(((e.clientY - rect.top) / rect.height) * raster.height);
      onPick(px, py);
    }
  }

  return (
    <div
      className="erase-viewport"
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Clic: seleccionar · Rueda: zoom · Arrastrar: mover"
    >
      <canvas ref={canvasRef} className="erase-canvas" />
    </div>
  );
}
