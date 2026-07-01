import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: repo name for GitHub Pages project sites; "/" for local dev/preview.
export default defineConfig({
  plugins: [react()],
  base: process.env.SP_BASE ?? "/",
});
