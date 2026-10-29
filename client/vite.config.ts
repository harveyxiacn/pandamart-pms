import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";

  return {
    // Project Pages are served from /<repo>/, so the demo build needs a base
    // path; the regular build keeps absolute asset URLs for the Express host.
    base: demo ? "/pandamart-pms/" : "/",
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
    },
    build: {
      outDir: demo ? "dist-demo" : path.resolve(__dirname, "../server/public"),
      emptyOutDir: true,
    },
  };
});
