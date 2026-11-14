import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare()],
  environments: {
    client: {
      build: {
        // Phaser alone is about 1.3 MB; a separate chunk keeps it cached across deploys.
        chunkSizeWarningLimit: 1500,
        rolldownOptions: {
          output: {
            codeSplitting: { groups: [{ name: "phaser", test: /node_modules[\\/]phaser/ }] },
          },
        },
      },
    },
  },
});
