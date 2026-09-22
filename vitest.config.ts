import { defineConfig } from "vitest/config";
import path from "path";

// Config própria (não a do Vite) porque o vite.config.ts carrega o lovable-tagger,
// que não tem nada a fazer num runner de teste headless.
export default defineConfig({
  test: {
    environment: "node",
    // regras de dinheiro vivem nos dois lados: no parser da edge e no front
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
