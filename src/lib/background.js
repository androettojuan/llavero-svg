// Deteccion del color de fondo: muestrea el perimetro de la imagen y devuelve
// el color dominante del borde. Sirve para excluir el fondo del modelo 3D y que
// el llavero tome la silueta del dibujo en vez de un rectangulo.

/**
 * @param {string} dataUrl
 * @returns {Promise<{r:number,g:number,b:number}|null>} color de borde o null.
 */
export function detectEdgeColor(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(img.width, 200);
      const h = Math.max(1, Math.round(img.height * (w / img.width)));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Acumular pixeles del perimetro en buckets de 5 bits por canal.
      const buckets = new Map(); // key -> {n, r, g, b}
      const add = (x, y) => {
        const o = (y * w + x) * 4;
        if (data[o + 3] < 128) return; // ignorar transparente
        const key = `${data[o] >> 3},${data[o + 1] >> 3},${data[o + 2] >> 3}`;
        const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++;
        b.r += data[o];
        b.g += data[o + 1];
        b.b += data[o + 2];
        buckets.set(key, b);
      };
      for (let x = 0; x < w; x++) {
        add(x, 0);
        add(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        add(0, y);
        add(w - 1, y);
      }

      let best = null;
      for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
      if (!best) return resolve(null); // todo transparente
      resolve({
        r: Math.round(best.r / best.n),
        g: Math.round(best.g / best.n),
        b: Math.round(best.b / best.n),
      });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Devuelve el hex de la paleta mas cercano (distancia RGB) al color dado.
export function nearestHex(palette, rgb) {
  if (!rgb || !palette?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const hex of palette) {
    const c = hexToRgb(hex);
    if (!c) continue;
    const d = (c.r - rgb.r) ** 2 + (c.g - rgb.g) ** 2 + (c.b - rgb.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = hex;
    }
  }
  return best;
}

// Si la imagen tiene transparencia, la compone sobre un color "chroma" uniforme
// (magenta) para que el vectorizador no convierta el fondo transparente en negro.
// Devuelve el color chroma para poder excluirlo despues como fondo.
const CHROMA = { r: 255, g: 0, b: 255 };

/**
 * @param {string} dataUrl
 * @returns {Promise<{dataUrl:string, chromaHex:string|null}>}
 */
export function flattenTransparency(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d = id.data;

      let hasAlpha = false;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] < 250) {
          hasAlpha = true;
          break;
        }
      }
      if (!hasAlpha) {
        resolve({ dataUrl, chromaHex: null });
        return;
      }

      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        d[i] = Math.round(d[i] * a + CHROMA.r * (1 - a));
        d[i + 1] = Math.round(d[i + 1] * a + CHROMA.g * (1 - a));
        d[i + 2] = Math.round(d[i + 2] * a + CHROMA.b * (1 - a));
        d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      resolve({ dataUrl: c.toDataURL("image/png"), chromaHex: "#ff00ff" });
    };
    img.onerror = () => resolve({ dataUrl, chromaHex: null });
    img.src = dataUrl;
  });
}

export const CHROMA_RGB = CHROMA;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
