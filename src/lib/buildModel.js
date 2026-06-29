// Etapa 3: construye la geometria 3D apilada del llavero a partir del SVG multicolor.
//
// Modelo: ImageTracer tesela todo el lienzo en regiones de color (no quedan huecos),
// asi que cada color se extruye desde z=0 hasta su altura. Las regiones no se solapan
// en planta, de modo que juntas forman una pieza solida con base comun y un relieve
// escalonado arriba: la capa en posicion i sube baseMm + (i+1)*stepMm.
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

const h2 = (n) => Math.round(n).toString(16).padStart(2, "0");

// Hex a partir del string de relleno del SVG ("rgb(r,g,b)" o "#rrggbb"),
// igual que extractPalette en vectorize. NO usamos path.color de three porque
// aplica conversion de espacio de color y no coincide con la paleta.
function fillToHex(fill) {
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(fill);
  if (rgb) return `#${h2(+rgb[1])}${h2(+rgb[2])}${h2(+rgb[3])}`;
  const hex = /^#?([0-9a-f]{6})$/i.exec(fill.trim());
  if (hex) return `#${hex[1].toLowerCase()}`;
  return null;
}

function parseViewBox(svg) {
  const m = svg.match(/viewBox="([\d.\s-]+)"/);
  if (m) {
    const [, , w, h] = m[1].trim().split(/\s+/).map(Number);
    if (w > 0 && h > 0) return { w, h };
  }
  // Fallback a width/height.
  const w = Number(svg.match(/width="([\d.]+)"/)?.[1]) || 100;
  const h = Number(svg.match(/height="([\d.]+)"/)?.[1]) || 100;
  return { w, h };
}

/**
 * @param {string} svgString  SVG multicolor.
 * @param {object} opts
 * @param {number} opts.baseMm    altura de la base solida (mm).
 * @param {number} opts.stepMm    alto extra por capa (mm).
 * @param {number} opts.heightMm  alto fisico final del llavero (mm).
 * @param {string[]} [opts.order]   colores (hex) de la capa mas baja a la mas alta.
 * @param {string[]} [opts.exclude] colores (hex) a NO extruir (p. ej. el fondo).
 * @returns {{ layers: Array<{color:string, geometry:THREE.BufferGeometry, top:number}>,
 *            size:{x:number,y:number,z:number} }}
 */
export function buildModel(
  svgString,
  { baseMm = 1, stepMm = 0.2, heightMm = 55, order, exclude = [] } = {}
) {
  const data = new SVGLoader().parse(svgString);
  const { w, h } = parseViewBox(svgString);

  // Agrupar shapes por color.
  const byColor = new Map();
  for (const path of data.paths) {
    const fill = path.userData?.style?.fill;
    if (!fill || fill === "none") continue;
    const hex = fillToHex(fill);
    if (!hex) continue;
    const shapes = SVGLoader.createShapes(path);
    if (!shapes.length) continue;
    if (!byColor.has(hex)) byColor.set(hex, []);
    byColor.get(hex).push(...shapes);
  }

  // Orden de apilado: el indicado por el usuario; el resto al final. Sin excluidos.
  const skip = new Set(exclude);
  const detected = [...byColor.keys()];
  const ordered = [];
  for (const c of order || [])
    if (byColor.has(c) && !skip.has(c) && !ordered.includes(c)) ordered.push(c);
  for (const c of detected) if (!skip.has(c) && !ordered.includes(c)) ordered.push(c);

  const scale = heightMm / h; // px del SVG -> mm

  const layers = [];
  ordered.forEach((hex, i) => {
    const top = baseMm + (i + 1) * stepMm; // altura desde z=0
    const geometry = new THREE.ExtrudeGeometry(byColor.get(hex), {
      depth: top,
      bevelEnabled: false,
      steps: 1,
    });
    // SVG tiene Y hacia abajo: invertir Y (y escalar a mm). Z ya esta en mm.
    geometry.scale(scale, -scale, 1);
    geometry.computeVertexNormals();
    layers.push({ color: hex, geometry, top });
  });

  // Centrar el conjunto en X/Y y apoyar la base en z=0.
  const box = new THREE.Box3();
  for (const l of layers) {
    l.geometry.computeBoundingBox();
    box.union(l.geometry.boundingBox);
  }
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  for (const l of layers) l.geometry.translate(-cx, -cy, 0);

  return {
    layers,
    size: {
      x: (box.max.x - box.min.x),
      y: (box.max.y - box.min.y),
      z: box.max.z,
    },
  };
}
