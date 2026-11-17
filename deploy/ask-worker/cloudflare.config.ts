// "Ask depower" Worker: answers chat questions on depower.abdulhabeeb.com/api/ask.
// Deploy with `cf deploy --secrets-file <file>` (see README.md in this folder).
import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "depower-ask",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-11-01",
    env: {
      // Per-visitor and daily counters, and 30 days of question logs (no IPs).
      ASK_KV: bindings.kv({ id: "7c84394d83a24d40981fb11a44625b1c" }),
      ANTHROPIC_API_KEY: bindings.secret(),
      IP_SALT: bindings.secret(),
      ASK_OWNER_TOKEN: bindings.secret(),
    },
    triggers: [triggers.fetch({ pattern: "depower.abdulhabeeb.com/api/ask*", zone: "abdulhabeeb.com" })],
  },
});
