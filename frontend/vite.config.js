import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // dev proxy (під час розробки поза Docker)
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8765",
        changeOrigin: true,
        // MJPEG streaming
        configure: (proxy) => {
          proxy.on("proxyRes", (res) => {
            res.headers["x-accel-buffering"] = "no";
          });
        },
      },
      "/ws": {
        target: "ws://localhost:8765",
        ws: true,
      },
    },
  },
});
