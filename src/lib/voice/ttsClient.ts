type TtsProvider = "together" | "openai" | "openrouter";

type TtsPayload = {
  text: string;
  provider?: TtsProvider;
};

const DEFAULT_ENDPOINT = "/api/tts";
const LOCAL_WORKER_ENDPOINTS = [
  "http://127.0.0.1:8787/api/tts",
  "http://localhost:8787/api/tts"
];

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

function getTtsEndpoints(): string[] {
  const endpoints: string[] = [];
  const configured = import.meta.env.VITE_TTS_ENDPOINT;
  if (typeof configured === "string" && configured.trim().length > 0) {
    endpoints.push(normalizeEndpoint(configured));
  } else {
    endpoints.push(DEFAULT_ENDPOINT);
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        endpoints.push(...LOCAL_WORKER_ENDPOINTS);
      }
    }
  }
  return [...new Set(endpoints)];
}

function getRequestedProvider(): TtsProvider | undefined {
  const provider = import.meta.env.VITE_TTS_PROVIDER;
  if (provider === "together" || provider === "openai" || provider === "openrouter") {
    return provider;
  }
  return undefined;
}

async function playBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("Audio playback failed"));
      };
      void audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function requestTts(payload: TtsPayload): Promise<boolean> {
  const endpoints = getTtsEndpoints();
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("audio/")) continue;

      const audioBlob = await response.blob();
      if (audioBlob.size === 0) continue;

      await playBlob(audioBlob);
      return true;
    } catch {
      // Try next endpoint.
    }
  }

  return false;
}

function speakWithBrowserTts(text: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!("speechSynthesis" in window)) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve(false);
    }
  });
}

let ttsQueue: Promise<void> = Promise.resolve();

export function announceSelection(text: string): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText) return Promise.resolve();

  ttsQueue = ttsQueue
    .then(async () => {
      await requestTts({
        text: cleanText,
        provider: getRequestedProvider()
      });
    })
    .catch(() => {
      // Swallow queue errors so later announcements continue.
    });

  return ttsQueue;
}

export function announceGuidance(text: string): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText) return Promise.resolve();

  ttsQueue = ttsQueue
    .then(async () => {
      const spokenLocally = await speakWithBrowserTts(cleanText);
      if (spokenLocally) return;
      await requestTts({
        text: cleanText,
        provider: getRequestedProvider()
      });
    })
    .catch(() => {
      // Swallow queue errors so later announcements continue.
    });

  return ttsQueue;
}

export function stopVoiceAnnouncements() {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}
