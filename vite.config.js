import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// En GitHub Pages el sitio se sirve bajo /<repo>/, por eso el base.
// En dev (npm run dev) base = "/" para que funcione en localhost.
const base = process.env.GITHUB_ACTIONS ? "/llavero-svg/" : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Llavero SVG Studio",
        short_name: "LlaveroSVG",
        description: "Convierte imagenes en SVG de line-art para llaveros 3D",
        theme_color: "#111827",
        background_color: "#0b0f17",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
