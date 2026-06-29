// Cliente minimo para la API de Gemini (generacion de arte multicolor plano).
// La key se guarda en localStorage y se llama directo desde el navegador.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Modelo de generacion de imagen ("Nano Banana"). Configurable desde Ajustes.
export const DEFAULT_MODEL = "gemini-2.5-flash-image";

function buildPrompt({ colors = 4 }) {
  return [
    `REDIBUJA esta imagen desde cero como una ilustracion vectorial minimalista tipo "flat design", con como maximo ${colors} colores planos solidos.`,
    "Es para fabricar un llavero 3D multicolor por capas, asi que necesito bloques de color solidos y simples.",
    "IGNORA por completo el sombreado, las luces y las sombras del original: NO los copies.",
    "Cada parte del dibujo debe pintarse con UN UNICO color plano y uniforme:",
    "- el cabello, un solo tono; la piel, un solo tono; cada prenda, un solo color plano; etc.",
    "Reglas estrictas (OBLIGATORIO):",
    "- PROHIBIDO sombras, luces, brillos, reflejos, volumen o profundidad.",
    "- PROHIBIDO degradados, gradientes, texturas, ruido o transparencias parciales.",
    "- Simplifica al maximo: formas grandes y limpias, la MINIMA cantidad de detalles.",
    "- Bordes nitidos y contornos cerrados; sin detalles diminutos.",
    `- En total no mas de ${colors} colores planos en toda la imagen.`,
    "- Fondo de un color plano uniforme (blanco puro si es posible).",
    "- Manten el personaje reconocible, centrado y con un pequeno margen.",
    "Devuelve unicamente la imagen resultante: colores 100% planos, estilo sticker plano.",
  ].join(" ");
}

function buildRefinePrompt({ colors = 4 }) {
  return [
    "EDITA esta MISMA imagen. NO la redibujes ni la reinterpretes.",
    "Es OBLIGATORIO conservar EXACTAMENTE el mismo sujeto, personaje, pose, proporciones,",
    "composicion y los mismos colores. NO cambies el contenido ni inventes nada nuevo.",
    "Lo unico que tenes que hacer es limpiar la imagen:",
    `- Aplana los colores a como maximo ${colors} colores solidos (sin degradados ni sombras).`,
    "- Elimina manchas, puntos y pixeles sueltos pequenos, sobre todo alrededor de ojos, boca y contornos.",
    "- Une las regiones del mismo color; bordes limpios, nitidos y continuos.",
    "- Fondo de un color plano uniforme.",
    "El resultado debe ser identico al original pero mas limpio. Devuelve unicamente la imagen.",
  ].join(" ");
}

// Convierte un File a base64 (sin el prefijo data:).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl) {
  return String(dataUrl).split(",")[1];
}

// Llamada base a Gemini: imagen (base64) + prompt -> dataURL de imagen.
async function callGemini({ apiKey, model, base64, mimeType = "image/png", prompt }) {
  if (!apiKey) throw new Error("Falta la API key de Gemini.");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"] },
  };

  const url = `${API_BASE}/${model || DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch {
      detail = await res.text();
    }
    throw new Error(`Gemini respondio ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);
  const inline = imgPart?.inlineData || imgPart?.inline_data;

  if (!inline?.data) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(
      textPart
        ? `El modelo no devolvio imagen. Respondio: ${textPart}`
        : "El modelo no devolvio ninguna imagen."
    );
  }

  const mime = inline.mimeType || inline.mime_type || "image/png";
  return `data:${mime};base64,${inline.data}`;
}

/**
 * 1ra pasada: genera el arte de colores planos a partir del archivo del usuario.
 * @returns {Promise<string>} dataURL (image/png)
 */
export async function generateColorArt({ apiKey, model, file, colors = 4 }) {
  if (!file) throw new Error("No hay imagen para procesar.");
  return callGemini({
    apiKey,
    model,
    base64: await fileToBase64(file),
    mimeType: file.type || "image/png",
    prompt: buildPrompt({ colors }),
  });
}

/**
 * 2da pasada (refinado): limpia una imagen ya posterizada para quitar manchas
 * y dejar los colores planos bien definidos.
 * @returns {Promise<string>} dataURL (image/png)
 */
export async function refineColorArt({ apiKey, model, imageDataUrl, colors = 4 }) {
  if (!imageDataUrl) throw new Error("No hay imagen para refinar.");
  return callGemini({
    apiKey,
    model,
    base64: dataUrlToBase64(imageDataUrl),
    mimeType: "image/png",
    prompt: buildRefinePrompt({ colors }),
  });
}
