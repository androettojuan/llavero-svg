// Vectorizacion del line-art (PNG -> SVG) usando ImageTracer en el navegador.
import ImageTracer from "imagetracerjs";

// Paleta forzada a blanco/negro para obtener contornos limpios.
const BW_PALETTE = [
  { r: 0, g: 0, b: 0, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
];

/**
 * Convierte un dataURL de imagen a SVG.
 * @param {string} dataUrl  imagen (line-art) en dataURL.
 * @param {object} opts
 * @param {number} opts.detail  0..100 (mas alto = mas detalle).
 * @returns {Promise<string>} contenido SVG.
 */
export function vectorize(dataUrl, { detail = 60 } = {}) {
  // Mapear "detalle" a parametros de ImageTracer.
  // Mas detalle => menos simplificacion (pathomit bajo, ltres/qtres bajos).
  const d = Math.min(100, Math.max(0, detail)) / 100;
  const options = {
    // Paleta fija blanco/negro.
    palette: BW_PALETTE,
    colorsampling: 0,
    numberofcolors: 2,
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
      ImageTracer.imageToSVG(dataUrl, (svg) => resolve(cleanupSvg(svg)), options);
    } catch (e) {
      reject(e);
    }
  });
}

// Quita los paths blancos (fondo) para dejar solo el contorno negro,
// util para importar a software 3D.
function cleanupSvg(svg) {
  // ImageTracer genera <path fill="rgb(255,255,255)" .../> para el fondo.
  return svg.replace(
    /<path[^>]*fill="rgb\(255,255,255\)"[^>]*\/>/g,
    ""
  );
}
