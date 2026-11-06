import { defineConfig } from "vite";

// The browser app lives in web/ and is built to dist/, which the Node server
// serves in production. During development `npm run dev` runs this dev server
// and forwards /api to the Node server on $PORT (8737 by default, see
// package.json).
export default defineConfig({
  root: "web",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": `http://localhost:${process.env.PORT ?? 8737}`,
    },
  },
});
