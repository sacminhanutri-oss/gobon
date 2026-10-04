import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const rawBase = process.env["CHECKOUT_BASE_PATH"];
const checkoutBase = rawBase
  ? `/${rawBase.replace(/^\/+|\/+$/g, "")}/`
  : undefined;

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(checkoutBase ? { vite: { base: checkoutBase } } : {}),
  ...(process.env["VERCEL"]
    ? {
        nitro: {
          preset: process.env["NITRO_PRESET"] || "vercel",
          ...(checkoutBase ? { baseURL: checkoutBase } : {}),
        },
      }
    : {}),
});
