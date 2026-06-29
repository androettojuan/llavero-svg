// Vista 2D interactiva: muestra el raster cuantizado y permite borrar la isla
// de color bajo el clic. Lo borrado se ve transparente (patron de cuadritos).
import { useEffect, useRef } from "react";

export default function EraseCanvas({ raster, erased, onErase }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !raster) return;
    const { width: w, height: h, array, palette } = raster;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const o = (j * w + i) * 4;
        if (erased && erased.has(j * w + i)) {
          img.data[o + 3] = 0; // transparente
          continue;
        }
        const p = palette[array[j + 1][i + 1]] || { r: 0, g: 0, b: 0, a: 255 };
        img.data[o] = p.r;
        img.data[o + 1] = p.g;
        img.data[o + 2] = p.b;
        img.data[o + 3] = p.a ?? 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [raster, erased]);

  function handleClick(e) {
    const canvas = canvasRef.current;
    if (!canvas || !raster) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor(((e.clientX - rect.left) / rect.width) * raster.width);
    const py = Math.floor(((e.clientY - rect.top) / rect.height) * raster.height);
    onErase(px, py);
  }

  return (
    <canvas
      ref={canvasRef}
      className="erase-canvas"
      onClick={handleClick}
      title="Clic para borrar la zona"
    />
  );
}
