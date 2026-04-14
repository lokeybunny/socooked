import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    target: "es2020",
    cssMinify: true,
    minify: "esbuild",
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react") || id.includes("scheduler") || id.includes("@tanstack/react-query") || id.includes("react-router")) {
            return "react-vendor";
          }
          if (id.includes("@supabase")) {
            return "supabase-vendor";
          }
          if (id.includes("@react-three") || id.includes("/three/")) {
            return "three-vendor";
          }
          if (id.includes("jspdf") || id.includes("jszip") || id.includes("xlsx")) {
            return "export-vendor";
          }
          if (id.includes("@radix-ui")) {
            return "radix-vendor";
          }
          if (id.includes("lucide-react")) {
            return "icons-vendor";
          }
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
