import { useEffect, useRef, useState } from "react";
import { generateColorArt, DEFAULT_MODEL } from "./lib/gemini.js";
import { vectorize } from "./lib/vectorize.js";

const LS_KEY = "gemini_api_key";
const LS_MODEL = "gemini_model";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [artUrl, setArtUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [palette, setPalette] = useState([]);

  const [detail, setDetail] = useState(60);
  const [numColors, setNumColors] = useState(4);

  // Parametros del modelo 3D (se usaran en etapas siguientes).
  const [baseMm, setBaseMm] = useState(1); // altura de la base solida
  const [stepMm, setStepMm] = useState(0.2); // alto extra por capa de color

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
    setSvg("");
    setPalette([]);
    setError("");
  }

  async function handleGenerate() {
    setError("");
    setSvg("");
    setPalette([]);
    try {
      setStatus("generating");
      const art = await generateColorArt({ apiKey, model, file, colors: numColors });
      setArtUrl(art);

      setStatus("vectorizing");
      const out = await vectorize(art, { detail, colors: numColors });
      setSvg(out.svg);
      setPalette(out.palette);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStatus("idle");
    }
  }

  // Re-vectorizar (barato, sin Gemini) cuando cambian detalle o cantidad de colores.
  async function reVectorize({ newDetail = detail, newColors = numColors } = {}) {
    setDetail(newDetail);
    setNumColors(newColors);
    if (!artUrl) return;
    try {
      setStatus("vectorizing");
      const out = await vectorize(artUrl, { detail: newDetail, colors: newColors });
      setSvg(out.svg);
      setPalette(out.palette);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStatus("idle");
    }
  }

  // Reordenar un color en la pila (dir: -1 sube hacia la base, +1 baja al tope).
  function moveColor(index, dir) {
    setPalette((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function downloadSvg() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = file?.name?.replace(/\.[^.]+$/, "") || "llavero";
    a.href = url;
    a.download = `${base}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
                onChange={(e) => reVectorize({ newDetail: Number(e.target.value) })}
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
                onChange={(e) => reVectorize({ newColors: Number(e.target.value) })}
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
                  Orden de apilado (1 = capa más baja, sobre la base)
                </span>
                <ul className="color-list">
                  {palette.map((c, i) => (
                    <li key={c} className="color-row">
                      <span className="layer-index">{i + 1}</span>
                      <span className="swatch" style={{ background: c }} title={c} />
                      <code className="hex">{c}</code>
                      <span className="layer-h">
                        {(baseMm + (i + 1) * stepMm).toFixed(2)} mm
                      </span>
                      <span className="move-btns">
                        <button
                          className="ghost"
                          disabled={i === 0}
                          onClick={() => moveColor(i, -1)}
                          title="Subir hacia la base"
                        >
                          ↑
                        </button>
                        <button
                          className="ghost"
                          disabled={i === palette.length - 1}
                          onClick={() => moveColor(i, 1)}
                          title="Bajar hacia el tope"
                        >
                          ↓
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
                <small>
                  Altura total ≈ {(baseMm + palette.length * stepMm).toFixed(2)} mm
                  (base {baseMm} mm + {palette.length} capas).
                </small>
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
                  ? "Vectorizando…"
                  : "Generar SVG"}
            </button>
            <button className="block" onClick={downloadSvg} disabled={!svg || busy}>
              Descargar SVG
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
          <Preview title="SVG multicolor" empty="Resultado final" wide>
            {svg && (
              <div className="svg-box" dangerouslySetInnerHTML={{ __html: svg }} />
            )}
          </Preview>
        </section>
      </main>
    </div>
  );
}

function Preview({ title, children, empty, wide }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className={`preview ${wide ? "wide" : ""}`}>
      <div className="preview-head">{title}</div>
      <div className="preview-body">
        {hasContent ? children : <span className="empty">{empty}</span>}
      </div>
    </div>
  );
}
