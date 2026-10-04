// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Self-hosting under a subpath (e.g. seudominio.com/pagamento proxied from another
// Vercel project): set CHECKOUT_BASE_PATH=/pagamento/ at build time. When unset,
// the app lives at "/" as usual (Lovable preview/publish).
const rawBase = process.env["CHECKOUT_BASE_PATH"];
const checkoutBase = rawBase
  ? `/${rawBase.replace(/^\/+|\/+$/g, "")}/`
  : undefined;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(checkoutBase ? { vite: { base: checkoutBase } } : {}),
  // Self-hosting: when building on Vercel, emit the Vercel preset instead of
  // the default Cloudflare target. NITRO_PRESET can override the preset name.
  ...(process.env["VERCEL"]
    ? { nitro: { preset: process.env["NITRO_PRESET"] || "vercel" } }
    : {}),
});
