// Vectorizacion del arte multicolor (PNG -> SVG) usando ImageTracer.
// Se separa en dos pasos para permitir edicion interactiva:
//   quantizeImage(): imagen -> mapa de indices de color (raster), limpiando islas.
//   traceRaster():   raster (+ pixeles borrados) -> SVG.
// floodComponent() detecta la "isla" de color bajo un clic, para borrarla.
import ImageTracer from "imagetracerjs";

const MAGENTA = { r: 255, g: 0, b: 255, a: 255 };

/**
 * Cuantiza la imagen a N colores y elimina islas chicas.
 * @returns {{width:number, height:number, array:number[][], palette:Array}}
 */
export async function quantizeImage(dataUrl, { colors = 4, smooth = 50, clean = 2 } = {}) {
  const s = Math.min(100, Math.max(0, smooth)) / 100;
  const c = Math.min(100, Math.max(0, clean)) / 100;
  const numColors = Math.min(8, Math.max(2, Math.round(colors)));

  const imgData = await loadImageData(dataUrl);
  const { array, palette } = ImageTracer.colorquantization(imgData, {
    colorsampling: 2,
    numberofcolors: numColors,
    mincolorratio: 0,
    colorquantcycles: 3,
    blurradius: Math.round(s * 5),
    blurdelta: 20,
  });

  const minArea = Math.round(c * 0.01 * imgData.width * imgData.height);
  if (minArea > 0) removeSmallComponents(array, imgData.width, imgData.height, minArea);

  return { width: imgData.width, height: imgData.height, array, palette };
}

/**
 * Traza el raster a SVG. Los pixeles en `erased` se pintan de magenta (fondo).
 * @returns {{svg:string, palette:string[]}}
 */
export function traceRaster(raster, { detail = 60, smooth = 50, erased = null } = {}) {
  const { width: w, height: h, array, palette } = raster;
  const d = Math.min(100, Math.max(0, detail)) / 100;
  const s = Math.min(100, Math.max(0, smooth)) / 100;

  const hasErased = erased && erased.size > 0;
  const tracePal = hasErased ? palette.concat([MAGENTA]) : palette;

  // Reconstruir imagen plana desde los indices (magenta en lo borrado).
  const data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      const p = hasErased && erased.has(j * w + i) ? MAGENTA : palette[array[j + 1][i + 1]] || MAGENTA;
      data[o] = p.r;
      data[o + 1] = p.g;
      data[o + 2] = p.b;
      data[o + 3] = p.a ?? 255;
    }
  }

  const svg = ImageTracer.imagedataToSVG(
    { width: w, height: h, data },
    {
      pal: tracePal,
      numberofcolors: tracePal.length,
      ltres: 0.5 + s * 3 + (1 - d) * 1.5,
      qtres: 0.5 + s * 3 + (1 - d) * 1.5,
      pathomit: Math.round(4 + s * 20 + (1 - d) * 24),
      blurradius: 0,
      scale: 1,
      roundcoords: 2,
      viewbox: true,
      desc: false,
      strokewidth: 0,
      linefilter: true,
    }
  );
  return { svg, palette: extractPalette(svg) };
}

/**
 * Devuelve los pixeles (indice j*w+i) de la isla de color bajo (px, py).
 * Conexion 4-conexa sobre el mapa de indices ya cuantizado.
 */
export function floodComponent(raster, px, py) {
  const { width: w, height: h, array } = raster;
  if (px < 0 || py < 0 || px >= w || py >= h) return [];
  const target = array[py + 1][px + 1];
  if (target < 0) return [];
  const seen = new Set();
  const out = [];
  const stack = [[py + 1, px + 1]];
  while (stack.length) {
    const [j, i] = stack.pop();
    const key = j * (w + 2) + i;
    if (seen.has(key)) continue;
    if (j < 1 || i < 1 || j > h || i > w) continue;
    if (array[j][i] !== target) continue;
    seen.add(key);
    out.push((j - 1) * w + (i - 1));
    stack.push([j - 1, i], [j + 1, i], [j, i - 1], [j, i + 1]);
  }
  return out;
}

function loadImageData(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error("No se pudo cargar la imagen para vectorizar."));
    img.src = dataUrl;
  });
}

// Reasigna las islas menores a minArea al indice vecino mas frecuente.
function removeSmallComponents(array, w, h, minArea) {
  const visited = Array.from({ length: h + 2 }, () => new Uint8Array(w + 2));
  const comps = [];
  for (let j = 1; j <= h; j++) {
    for (let i = 1; i <= w; i++) {
      if (visited[j][i] || array[j][i] < 0) continue;
      const val = array[j][i];
      const cells = [];
      const neigh = new Map();
      const stack = [[j, i]];
      visited[j][i] = 1;
      while (stack.length) {
        const [cj, ci] = stack.pop();
        cells.push(cj, ci);
        const around = [[cj - 1, ci], [cj + 1, ci], [cj, ci - 1], [cj, ci + 1]];
        for (const [nj, ni] of around) {
          const nv = array[nj][ni];
          if (nv === val) {
            if (!visited[nj][ni]) {
              visited[nj][ni] = 1;
              stack.push([nj, ni]);
            }
          } else if (nv >= 0) {
            neigh.set(nv, (neigh.get(nv) || 0) + 1);
          }
        }
      }
      if (cells.length / 2 < minArea && neigh.size) {
        let best = val;
        let bestN = -1;
        for (const [k, n] of neigh) if (n > bestN) ((bestN = n), (best = k));
        comps.push({ cells, to: best });
      }
    }
  }
  for (const { cells, to } of comps) {
    for (let k = 0; k < cells.length; k += 2) array[cells[k]][cells[k + 1]] = to;
  }
}

function extractPalette(svg) {
  const seen = new Map();
  const re = /fill="rgb\((\d+),(\d+),(\d+)\)"/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const hex = rgbToHex(+m[1], +m[2], +m[3]);
    seen.set(hex, (seen.get(hex) || 0) + 1);
  }
  return Array.from(seen.keys());
}

function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
