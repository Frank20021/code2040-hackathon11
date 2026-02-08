/// <reference types="vite/client" />

declare module "virtual:pwa-register" {
  export function registerSW(options?: { immediate?: boolean }): void;
}

interface ImportMetaEnv {
  readonly VITE_TTS_ENDPOINT?: string;
  readonly VITE_TTS_PROVIDER?: "together" | "openai" | "openrouter";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
