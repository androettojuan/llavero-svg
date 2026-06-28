// Vectorizacion del arte multicolor (PNG -> SVG) usando ImageTracer en el navegador.
// A diferencia de la version line-art (blanco/negro), aca cuantizamos la imagen a
// N colores planos y devolvemos tambien la paleta detectada, base para el 3MF.
import ImageTracer from "imagetracerjs";

/**
 * Convierte un dataURL de imagen a SVG multicolor.
 * @param {string} dataUrl  imagen en dataURL.
 * @param {object} opts
 * @param {number} opts.detail   0..100 (mas alto = mas detalle).
 * @param {number} opts.colors   cantidad de colores a cuantizar (2..8).
 * @returns {Promise<{svg: string, palette: string[]}>}
 */
export function vectorize(dataUrl, { detail = 60, colors = 4 } = {}) {
  // Mapear "detalle" a parametros de ImageTracer.
  // Mas detalle => menos simplificacion (pathomit bajo, ltres/qtres bajos).
  const d = Math.min(100, Math.max(0, detail)) / 100;
  const numColors = Math.min(8, Math.max(2, Math.round(colors)));
  const options = {
    // Cuantizacion de color: que ImageTracer elija la paleta optima.
    colorsampling: 2,
    numberofcolors: numColors,
    mincolorratio: 0,
    colorquantcycles: 3,
    // Simplificacion: a mayor detalle, menores umbrales.
    ltres: 0.1 + (1 - d) * 2.4, // 0.1 .. 2.5
    qtres: 0.1 + (1 - d) * 2.4,
    pathomit: Math.round(2 + (1 - d) * 30), // 2 .. 32 (descarta formas chicas)
    // Suavizado de bordes.
    blurradius: 0,
    blurdelta: 20,
    // Salida.
    scale: 1,
    roundcoords: 2,
    viewbox: true,
    desc: false,
    strokewidth: 0,
    linefilter: true,
  };

  return new Promise((resolve, reject) => {
    try {
      ImageTracer.imageToSVG(
        dataUrl,
        (svg) => resolve({ svg, palette: extractPalette(svg) }),
        options
      );
    } catch (e) {
      reject(e);
    }
  });
}

// Extrae los colores unicos (fill) presentes en el SVG, en orden de aparicion.
// Devuelve hex normalizados (#rrggbb).
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
