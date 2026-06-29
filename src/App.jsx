import { useEffect, useMemo, useRef, useState } from "react";
import { generateColorArt, DEFAULT_MODEL } from "./lib/gemini.js";
import { quantizeImage, traceRaster, floodComponent } from "./lib/vectorize.js";
import { buildModel } from "./lib/buildModel.js";
import { export3mf } from "./lib/export3mf.js";
import {
  detectEdgeColor,
  nearestHex,
  flattenTransparency,
  CHROMA_RGB,
} from "./lib/background.js";
import Viewer3D from "./components/Viewer3D.jsx";
import EraseCanvas from "./components/EraseCanvas.jsx";

const HEIGHT_MM = 55; // alto fisico del llavero (spec)

const LS_KEY = "gemini_api_key";
const LS_MODEL = "gemini_model";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [artUrl, setArtUrl] = useState(""); // arte de Gemini (para mostrar)
  const [artFlatUrl, setArtFlatUrl] = useState(""); // arte aplanado (para vectorizar)
  const [chromaHex, setChromaHex] = useState(null); // color de fondo si hubo transparencia
  const [svg, setSvg] = useState("");
  const [palette, setPalette] = useState([]);
  const [raster, setRaster] = useState(null); // mapa de colores cuantizado (para editar)
  const [erasedStrokes, setErasedStrokes] = useState([]); // pixeles borrados por clic
  const [rebuildKey, setRebuildKey] = useState(0); // fuerza reconstruir el modelo 3D
  const [exaggerate, setExaggerate] = useState(false); // exagerar relieve en la vista

  const [detail, setDetail] = useState(60);
  const [numColors, setNumColors] = useState(4);
  const [smooth, setSmooth] = useState(50);

  // Parametros del modelo 3D.
  const [baseMm, setBaseMm] = useState(1); // altura de la base solida
  const [stepMm, setStepMm] = useState(0.2); // alto extra por capa de color
  const [cleanup, setCleanup] = useState(2); // quitar islas/manchas sueltas (0..100)
  const [excludedColors, setExcludedColors] = useState([]); // colores tratados como fondo
  const [bgSample, setBgSample] = useState(null); // color crudo del borde {r,g,b}

  const [status, setStatus] = useState("idle"); // idle | generating | vectorizing
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  // Cargar key/modelo guardados.
  useEffect(() => {
    setApiKey(localStorage.getItem(LS_KEY) || "");
    setModel(localStorage.getItem(LS_MODEL) || DEFAULT_MODEL);
  }, []);

  function saveKey(value) {
    setApiKey(value);
    localStorage.setItem(LS_KEY, value);
  }
  function saveModel(value) {
    setModel(value);
    localStorage.setItem(LS_MODEL, value || DEFAULT_MODEL);
  }

  function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setSourceUrl(URL.createObjectURL(f));
    setArtUrl("");
    setArtFlatUrl("");
    setChromaHex(null);
    setSvg("");
    setPalette([]);
    setRaster(null);
    setErasedStrokes([]);
    setBgSample(null);
    setError("");
  }

  // Conjunto de pixeles borrados (union de los clics).
  const erasedSet = useMemo(() => {
    const set = new Set();
    for (const stroke of erasedStrokes) for (const p of stroke) set.add(p);
    return set;
  }, [erasedStrokes]);

  // Sugerencia inicial de fondo para una paleta recien generada.
  function initialBackground(pal) {
    if (chromaHex) return []; // el fondo magenta se excluye solo (near-magenta)
    const auto = nearestHex(pal, bgSample);
    return auto ? [auto] : [];
  }

  async function handleGenerate() {
    setError("");
    setSvg("");
    setPalette([]);
    setErasedStrokes([]);
    try {
      setStatus("generating");
      const art = await generateColorArt({ apiKey, model, file, colors: numColors });
      setArtUrl(art);

      // Aplanar transparencia (si la hay) para que el vectorizador no la vea negra.
      const flat = await flattenTransparency(art);
      setArtFlatUrl(flat.dataUrl);
      setChromaHex(flat.chromaHex);
      const sample = flat.chromaHex ? CHROMA_RGB : await detectEdgeColor(art);
      setBgSample(sample);

      setStatus("vectorizing");
      const r = await quantizeImage(flat.dataUrl, {
        colors: numColors + (flat.chromaHex ? 1 : 0),
        smooth,
        clean: cleanup,
      });
      setRaster(r);
      const out = traceRaster(r, { detail, smooth });
      setSvg(out.svg);
      setPalette(out.palette);
      setExcludedColors(
        flat.chromaHex ? [] : (nearestHex(out.palette, sample) ? [nearestHex(out.palette, sample)] : [])
      );
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStatus("idle");
    }
  }

  // Re-cuantizar (sin Gemini) cuando cambian colores, suavizado o limpieza.
  async function reQuantize({
    newColors = numColors,
    newSmooth = smooth,
    newClean = cleanup,
  } = {}) {
    setNumColors(newColors);
    setSmooth(newSmooth);
    setCleanup(newClean);
    if (!artFlatUrl) return;
    try {
      setStatus("vectorizing");
      const r = await quantizeImage(artFlatUrl, {
        colors: newColors + (chromaHex ? 1 : 0),
        smooth: newSmooth,
        clean: newClean,
      });
      setRaster(r);
      const out = traceRaster(r, { detail, smooth: newSmooth, erased: erasedSet });
      setSvg(out.svg);
      setPalette(out.palette);
      setExcludedColors(initialBackground(out.palette));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStatus("idle");
    }
  }

  // Re-trazar (muy barato) cuando cambia el detalle o se borra una zona.
  function reTrace({ newDetail = detail, erased = erasedSet } = {}) {
    setDetail(newDetail);
    if (!raster) return;
    const out = traceRaster(raster, { detail: newDetail, smooth, erased });
    setSvg(out.svg);
    setPalette(out.palette);
  }

  // Borrar la isla de color bajo el clic (la pinta como fondo).
  function eraseAt(px, py) {
    if (!raster) return;
    const pixels = floodComponent(raster, px, py);
    if (!pixels.length) return;
    const nextStrokes = [...erasedStrokes, pixels];
    setErasedStrokes(nextStrokes);
    const set = new Set(erasedSet);
    for (const p of pixels) set.add(p);
    reTrace({ erased: set });
  }

  function undoErase() {
    if (!erasedStrokes.length) return;
    const nextStrokes = erasedStrokes.slice(0, -1);
    setErasedStrokes(nextStrokes);
    const set = new Set();
    for (const stroke of nextStrokes) for (const p of stroke) set.add(p);
    reTrace({ erased: set });
  }

  function downloadModel() {
    if (!model3d) return;
    // Exportar siempre con el paso real (la exageracion es solo para la vista).
    const exportModel = exaggerate
      ? buildModel(svg, {
          baseMm,
          stepMm,
          heightMm: HEIGHT_MM,
          order: palette,
          exclude: effectiveExcluded,
        })
      : model3d;
    const blob = export3mf(exportModel);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = file?.name?.replace(/\.[^.]+$/, "") || "llavero";
    a.href = url;
    a.download = `${base}.3mf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reordenar un color en la pila (dir: -1 sube hacia la base, +1 baja al tope).
  // Intercambia con el color visible vecino (salteando los magenta/fondo).
  function moveColor(color, dir) {
    setPalette((prev) => {
      const idx = prev.indexOf(color);
      if (idx < 0) return prev;
      let j = idx + dir;
      while (j >= 0 && j < prev.length && isMagentaish(prev[j])) j += dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }


  function toggleExclude(c) {
    setExcludedColors((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  // Exclusion efectiva: lo marcado a mano + los colores ~magenta (fondo y zonas
  // borradas, que se pintan de magenta al trazar).
  const effectiveExcluded = useMemo(() => {
    const set = new Set(excludedColors);
    for (const c of palette) if (isMagentaish(c)) set.add(c);
    return [...set];
  }, [excludedColors, palette]);

  // Colores que sí forman capas (sin los marcados como fondo), en orden de apilado.
  const stackOrder = palette.filter((c) => !effectiveExcluded.includes(c));

  // Construir el modelo 3D cuando cambian el SVG, el orden o las dimensiones.
  // En la vista se puede exagerar el relieve (x6) para que el orden se note;
  // el .3mf exportado usa el paso real.
  const VIEW_FACTOR = 6;
  const model3d = useMemo(() => {
    if (!svg || !palette.length) return null;
    try {
      return buildModel(svg, {
        baseMm,
        stepMm: stepMm * (exaggerate ? VIEW_FACTOR : 1),
        heightMm: HEIGHT_MM,
        order: palette,
        exclude: effectiveExcluded,
      });
    } catch (e) {
      console.error("buildModel:", e);
      return null;
    }
  }, [svg, palette, baseMm, stepMm, exaggerate, effectiveExcluded.join(","), rebuildKey]);

  const busy = status !== "idle";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◈</span>
          <div>
            <h1>Llavero SVG Studio</h1>
            <p>Imagen → arte a color (Gemini) → SVG multicolor</p>
          </div>
        </div>
      </header>

      <main className="grid">
        {/* Panel de control */}
        <section className="panel">
          <h2>1. API Key de Gemini</h2>
          <div className="field">
            <div className="key-row">
              <input
                type={showKey ? "text" : "password"}
                placeholder="AQ.Ab8..."
                value={apiKey}
                onChange={(e) => saveKey(e.target.value)}
                autoComplete="off"
              />
              <button className="ghost" onClick={() => setShowKey((s) => !s)}>
                {showKey ? "Ocultar" : "Ver"}
              </button>
            </div>
            <small>
              Se guarda solo en este navegador. Conseguila en{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
              . Requiere facturación habilitada para generar imágenes.
            </small>
            <label className="model-label">
              Modelo
              <input
                type="text"
                value={model}
                onChange={(e) => saveModel(e.target.value)}
                placeholder={DEFAULT_MODEL}
              />
            </label>
          </div>

          <h2>2. Imagen</h2>
          <div className="field">
            <button className="primary block" onClick={() => fileInput.current?.click()}>
              Elegir imagen…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={onPickFile}
            />
            {file && <small className="filename">{file.name}</small>}
          </div>

          <h2>3. Ajustes</h2>
          <div className="field">
            <label className="slider">
              <span>
                Detalle <b>{detail}</b>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={detail}
                onChange={(e) => reTrace({ newDetail: Number(e.target.value) })}
              />
            </label>

            <label className="slider">
              <span>
                Colores <b>{numColors}</b>
              </span>
              <input
                type="range"
                min="2"
                max="8"
                value={numColors}
                onChange={(e) => reQuantize({ newColors: Number(e.target.value) })}
              />
            </label>

            <label className="slider">
              <span>
                Suavizado <b>{smooth}</b>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={smooth}
                onChange={(e) => reQuantize({ newSmooth: Number(e.target.value) })}
              />
            </label>

            <label className="slider">
              <span>
                Quitar sueltas <b>{cleanup}</b>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={cleanup}
                onChange={(e) => reQuantize({ newClean: Number(e.target.value) })}
              />
            </label>
            <small>
              La cantidad se pide a Gemini al generar; moverla acá recuantiza el
              SVG actual sin volver a llamar a Gemini.
            </small>

          </div>

          {palette.length > 0 && (
            <>
              <h2>4. Capas de color</h2>
              <div className="field">
                <div className="dims">
                  <label className="num">
                    <span>Base (mm)</span>
                    <input
                      type="number"
                      min="0.2"
                      step="0.1"
                      value={baseMm}
                      onChange={(e) => setBaseMm(Number(e.target.value))}
                    />
                  </label>
                  <label className="num">
                    <span>Paso por capa (mm)</span>
                    <input
                      type="number"
                      min="0.05"
                      step="0.05"
                      value={stepMm}
                      onChange={(e) => setStepMm(Number(e.target.value))}
                    />
                  </label>
                </div>

                <span className="palette-label">
                  Orden de apilado (1 = capa más baja). Marcá "fondo" en los
                  colores que no querés imprimir.
                </span>
                <ul className="color-list">
                  {palette.filter((c) => !isMagentaish(c)).map((c, i, arr) => {
                    const isBg = excludedColors.includes(c);
                    const layerNo = isBg ? 0 : stackOrder.indexOf(c) + 1;
                    return (
                      <li key={c} className={`color-row ${isBg ? "is-bg" : ""}`}>
                        <span className="layer-index">{isBg ? "—" : layerNo}</span>
                        <span className="swatch" style={{ background: c }} title={c} />
                        <code className="hex">{c}</code>
                        <span className="layer-h">
                          {isBg
                            ? "fondo"
                            : `${(baseMm + layerNo * stepMm).toFixed(2)} mm`}
                        </span>
                        <button
                          className={`ghost bg-toggle ${isBg ? "on" : ""}`}
                          onClick={() => toggleExclude(c)}
                          title="Marcar/desmarcar como fondo (no se imprime)"
                        >
                          fondo
                        </button>
                        <span className="move-btns">
                          <button
                            className="ghost"
                            disabled={i === 0}
                            onClick={() => moveColor(c, -1)}
                            title="Subir hacia la base"
                          >
                            ↑
                          </button>
                          <button
                            className="ghost"
                            disabled={i === arr.length - 1}
                            onClick={() => moveColor(c, 1)}
                            title="Bajar hacia el tope"
                          >
                            ↓
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <small>
                  Altura total ≈ {(baseMm + stackOrder.length * stepMm).toFixed(2)} mm
                  (base {baseMm} mm + {stackOrder.length} capas).
                </small>
                <button
                  className="block"
                  onClick={() => setRebuildKey((k) => k + 1)}
                  disabled={busy}
                >
                  Actualizar modelo 3D
                </button>
              </div>
            </>
          )}

          <div className="actions">
            <button
              className="primary block"
              onClick={handleGenerate}
              disabled={!apiKey || !file || busy}
            >
              {status === "generating"
                ? "Generando arte…"
                : status === "vectorizing"
                  ? "Armando modelo…"
                  : artUrl
                    ? "Regenerar llavero"
                    : "Generar llavero"}
            </button>
            <button
              className="block"
              onClick={downloadModel}
              disabled={!model3d || busy}
            >
              Descargar .3mf
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </section>

        {/* Previsualizaciones */}
        <section className="previews">
          <Preview title="Original" empty="Subí una imagen">
            {sourceUrl && <img src={sourceUrl} alt="original" />}
          </Preview>
          <Preview title="Arte a color (Gemini)" empty="Se genera al procesar">
            {artUrl && <img src={artUrl} alt="arte a color" />}
          </Preview>
          <Preview
            title="Editar · clic para borrar"
            empty="Se genera al procesar"
            head={
              erasedStrokes.length > 0 && (
                <button className="ghost mini" onClick={undoErase} disabled={busy}>
                  Deshacer
                </button>
              )
            }
          >
            {raster && (
              <EraseCanvas raster={raster} erased={erasedSet} onErase={eraseAt} />
            )}
          </Preview>
          <Preview
            title={`Modelo 3D${model3d ? ` · ${model3d.size.x.toFixed(0)}×${model3d.size.y.toFixed(0)}×${(exaggerate ? model3d.size.z / VIEW_FACTOR : model3d.size.z).toFixed(1)} mm` : ""}`}
            empty="Se arma desde el SVG"
            wide
            head={
              model3d && (
                <label className="check mini">
                  <input
                    type="checkbox"
                    checked={exaggerate}
                    onChange={(e) => setExaggerate(e.target.checked)}
                  />
                  <span>Exagerar relieve (vista)</span>
                </label>
              )
            }
          >
            {model3d && <Viewer3D model={model3d} />}
          </Preview>
        </section>
      </main>
    </div>
  );
}

function Preview({ title, children, empty, wide, head }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className={`preview ${wide ? "wide" : ""}`}>
      <div className="preview-head">
        <span>{title}</span>
        {head}
      </div>
      <div className="preview-body">
        {hasContent ? children : <span className="empty">{empty}</span>}
      </div>
    </div>
  );
}

// Un color es "magenta-ish" (fondo/zona borrada) si esta cerca de #ff00ff.
function isMagentaish(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return Math.abs(r - 255) + Math.abs(g - 0) + Math.abs(b - 255) < 120;
}
