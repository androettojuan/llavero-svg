# Llavero SVG Studio

PWA para convertir imágenes en **SVG de line-art** listos para fabricar llaveros 3D.

Flujo: **imagen → Gemini genera el line-art (PNG) → la app lo vectoriza a SVG → descargás el `.svg`**.

## Stack
- React + Vite
- `imagetracerjs` (vectorización en el navegador)
- `vite-plugin-pwa` (instalable / offline)
- API de Gemini (generación de imagen)

## Uso
```bash
npm install
npm run dev
```

1. Pegá tu **API key de Gemini** (se guarda solo en tu navegador). La obtenés en https://aistudio.google.com/apikey
2. Elegí una imagen.
3. Ajustá **detalle** y **grosor de línea**.
4. **Generar SVG** y luego **Descargar SVG**.

> El modelo por defecto es `gemini-2.5-flash-image`. Podés cambiarlo en el campo "Modelo" si Google actualiza el nombre.

## Notas
- La key queda en `localStorage` y las llamadas salen directo desde el navegador. Es ideal para uso personal; si publicás la app para terceros, conviene poner un backend que oculte la key.
- El slider de **detalle** re-vectoriza al instante (no vuelve a llamar a Gemini). El **grosor** sí se aplica al regenerar el line-art.

## Build
```bash
npm run build
npm run preview
```
