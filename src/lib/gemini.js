// Cliente minimo para la API de Gemini (generacion de imagen line-art).
// La key se guarda en localStorage y se llama directo desde el navegador.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Modelo de generacion de imagen ("Nano Banana"). Configurable desde Ajustes.
export const DEFAULT_MODEL = "gemini-2.5-flash-image";

function buildPrompt({ thickness }) {
  const grosor =
    thickness === "fino"
      ? "lineas finas"
      : thickness === "grueso"
        ? "lineas gruesas y bien marcadas"
        : "lineas de grosor medio";

  return [
    "Convierte esta imagen en un dibujo de line-art en blanco y negro,",
    "pensado para fabricar un llavero 3D.",
    "Reglas estrictas:",
    "- Solo contornos negros sobre fondo blanco puro.",
    "- Sin sombras, sin grises, sin relleno de color, sin degradados.",
    `- Contornos limpios, continuos y cerrados, con ${grosor}.`,
    "- Manten las formas y el texto principal reconocibles.",
    "- Centra el dibujo con un pequeno margen alrededor.",
    "Devuelve unicamente la imagen resultante.",
  ].join(" ");
}

// Convierte un File a base64 (sin el prefijo data:).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = String(result).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Llama a Gemini para generar el line-art.
 * @returns {Promise<string>} dataURL (image/png) del line-art.
 */
export async function generateLineArt({ apiKey, model, file, thickness }) {
  if (!apiKey) throw new Error("Falta la API key de Gemini.");
  if (!file) throw new Error("No hay imagen para procesar.");

  const base64 = await fileToBase64(file);
  const usedModel = model || DEFAULT_MODEL;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildPrompt({ thickness }) },
          {
            inline_data: {
              mime_type: file.type || "image/png",
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
    },
  };

  const url = `${API_BASE}/${usedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
