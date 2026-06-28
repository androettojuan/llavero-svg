import { useEffect, useRef, useState } from "react";
import { generateLineArt, DEFAULT_MODEL } from "./lib/gemini.js";
import { vectorize } from "./lib/vectorize.js";

const LS_KEY = "gemini_api_key";
const LS_MODEL = "gemini_model";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);

  const [file, setFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [lineArtUrl, setLineArtUrl] = useState("");
  const [svg, setSvg] = useState("");

  const [detail, setDetail] = useState(60);
  const [thickness, setThickness] = useState("medio");

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
    setLineArtUrl("");
    setSvg("");
    setError("");
  }

  async function handleGenerate() {
    setError("");
    setSvg("");
    try {
      setStatus("generating");
      const art = await generateLineArt({ apiKey, model, file, thickness });
      setLineArtUrl(art);

      setStatus("vectorizing");
      const out = await vectorize(art, { detail });
      setSvg(out);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStatus("idle");
    }
  }

  // Re-vectorizar cuando cambia el detalle (si ya hay line-art).
  async function reVectorize(newDetail) {
    setDetail(newDetail);
    if (!lineArtUrl) return;
    try {
      setStatus("vectorizing");
      const out = await vectorize(lineArtUrl, { detail: newDetail });
      setSvg(out);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStatus("idle");
    }
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
            <p>Imagen → line-art (Gemini) → SVG vectorial</p>
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
                onChange={(e) => reVectorize(Number(e.target.value))}
              />
            </label>

            <label className="select">
              <span>Grosor de línea</span>
              <select value={thickness} onChange={(e) => setThickness(e.target.value)}>
                <option value="fino">Fino</option>
                <option value="medio">Medio</option>
                <option value="grueso">Grueso</option>
              </select>
            </label>
            <small>El grosor se aplica al regenerar el line-art con Gemini.</small>
          </div>

          <div className="actions">
            <button
              className="primary block"
              onClick={handleGenerate}
              disabled={!apiKey || !file || busy}
            >
              {status === "generating"
                ? "Generando line-art…"
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
          <Preview title="Line-art (Gemini)" empty="Se genera al procesar">
            {lineArtUrl && <img src={lineArtUrl} alt="line art" />}
          </Preview>
          <Preview title="SVG vectorial" empty="Resultado final" wide>
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
