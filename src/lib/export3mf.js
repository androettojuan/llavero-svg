// Exporta el llavero a .3mf compatible con Bambu Studio / Orca Slicer.
// Cada color es una "parte" del objeto, asignada a un filamento distinto
// (extruder 1..N) mediante Metadata/model_settings.config, ademas del color
// de visualizacion en basematerials. Asi el slicer separa por filamento.
import { zipSync, strToU8 } from "fflate";

const CT = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="config" ContentType="application/xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const IDENT = "1 0 0 0 1 0 0 0 1 0 0 0";

function num(n) {
  return Number(n.toFixed(4)).toString();
}

// Bloque <mesh> de una geometria de three (no indexada).
function meshXml(geometry) {
  const pos = geometry.getAttribute("position");
  const index = geometry.getIndex();

  const verts = [];
  for (let i = 0; i < pos.count; i++) {
    verts.push(`<vertex x="${num(pos.getX(i))}" y="${num(pos.getY(i))}" z="${num(pos.getZ(i))}"/>`);
  }

  const tris = [];
  // Invertimos (a,c,b): la geometria viene con un eje reflejado, asi el winding
  // queda hacia afuera.
  const emit = (a, b, c) => tris.push(`<triangle v1="${a}" v2="${c}" v3="${b}"/>`);
  if (index) {
    for (let i = 0; i < index.count; i += 3) emit(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  } else {
    for (let i = 0; i < pos.count; i += 3) emit(i, i + 1, i + 2);
  }

  return `<mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh>`;
}

/**
 * @param {{layers: Array<{color:string, geometry:object}>}} model
 * @returns {Blob} archivo .3mf (proyecto Bambu/Orca)
 */
export function export3mf(model) {
  const layers = model.layers;
  const n = layers.length;
  const matId = n + 1; // id de basematerials
  const containerId = n + 2; // objeto contenedor

  const bases = layers
    .map((l) => `<base name="${l.color}" displaycolor="${l.color.toUpperCase()}FF"/>`)
    .join("");

  // Una parte (object) por color.
  const partObjects = layers
    .map(
      (l, i) =>
        `<object id="${i + 1}" type="model" pid="${matId}" pindex="${i}">${meshXml(l.geometry)}</object>`
    )
    .join("");

  // Contenedor que agrupa todas las partes.
  const components = layers
    .map((_, i) => `<component objectid="${i + 1}" transform="${IDENT}"/>`)
    .join("");

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application" value="Llavero SVG Studio"/>
  <resources>
    <basematerials id="${matId}">${bases}</basematerials>
    ${partObjects}
    <object id="${containerId}" type="model"><components>${components}</components></object>
  </resources>
  <build><item objectid="${containerId}" transform="${IDENT}" printable="1"/></build>
</model>`;

  // Config de Bambu/Orca: asigna un filamento (extruder) por parte/color.
  const parts = layers
    .map(
      (l, i) =>
        `    <part id="${i + 1}" subtype="normal_part">\n` +
        `      <metadata key="name" value="color ${i + 1} ${l.color}"/>\n` +
        `      <metadata key="extruder" value="${i + 1}"/>\n` +
        `    </part>`
    )
    .join("\n");

  const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${containerId}">
    <metadata key="name" value="llavero"/>
    <metadata key="extruder" value="1"/>
${parts}
  </object>
</config>`;

  const zipped = zipSync({
    "[Content_Types].xml": strToU8(CT),
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": strToU8(modelXml),
    "Metadata/model_settings.config": strToU8(modelSettings),
  });

  return new Blob([zipped], { type: "model/3mf" });
}
