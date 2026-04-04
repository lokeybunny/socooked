import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
      clientPort: 443,
      protocol: "wss",
    },
  },
  build: {
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
          if (id.includes("recharts")) {
            return "charts-vendor";
          }
          if (id.includes("jspdf") || id.includes("jszip") || id.includes("xlsx")) {
            return "export-vendor";
          }
          if (id.includes("framer-motion")) {
            return "motion-vendor";
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
