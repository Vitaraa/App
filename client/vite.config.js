import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev`, proxy /api calls to the Express backend on :4000.
// In production the backend serves the built files, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose dev server on the LAN too
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
