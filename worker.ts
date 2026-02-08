type Env = {
  ASSETS: Fetcher;
  TOGETHER_API_KEY?: string;
  TOGETHER_TTS_MODEL?: string;
  TOGETHER_TTS_VOICE?: string;
  TOGETHER_TTS_FORMAT?: "mp3" | "wav";
  OPENAI_API_KEY?: string;
  OPENAI_TTS_MODEL?: string;
  OPENAI_TTS_VOICE?: string;
  OPENAI_TTS_FORMAT?: "mp3" | "wav" | "opus";
  OPENAI_TRANSCRIBE_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_TTS_MODEL?: string;
  OPENROUTER_TTS_VOICE?: string;
  OPENROUTER_TTS_FORMAT?: "mp3" | "wav" | "opus";
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_NAME?: string;
};

type TtsRequestBody = {
  text?: unknown;
  voice?: unknown;
  format?: unknown;
  provider?: unknown;
};

type TtsProvider = "together" | "openai" | "openrouter";

const TOGETHER_BASE_URL = "https://api.together.xyz/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_TOGETHER_TTS_MODEL = "hexgrad/Kokoro-82M";
const DEFAULT_TOGETHER_TTS_VOICE = "af_alloy";
const DEFAULT_TOGETHER_TTS_FORMAT = "wav";
const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENROUTER_TTS_MODEL = "openai/gpt-audio-mini";
const DEFAULT_TRANSCRIBE_MODEL = "whisper-1";
const DEFAULT_VOICE = "alloy";
const DEFAULT_FORMAT = "mp3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
} as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS
    }
  });
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "");
  const raw = atob(clean);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function normalizeFormat(value: unknown): "mp3" | "wav" | "opus" {
  if (typeof value !== "string") return DEFAULT_FORMAT;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "wav" || trimmed === "opus" || trimmed === "mp3") return trimmed;
  return DEFAULT_FORMAT;
}

function normalizeVoice(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeProvider(value: unknown): TtsProvider | null {
  if (value === "together") return value;
  if (value === "openai" || value === "openrouter") return value;
  return null;
}

function normalizeTogetherFormat(value: unknown): "mp3" | "wav" {
  if (typeof value !== "string") return DEFAULT_TOGETHER_TTS_FORMAT;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "mp3" || trimmed === "wav") return trimmed;
  return DEFAULT_TOGETHER_TTS_FORMAT;
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function extractAudioBase64(payload: unknown): string | null {
  const root = payload as Record<string, unknown> | null;
  if (!root || typeof root !== "object") return null;

  const completionAudio =
    (root.choices as Array<{ message?: { audio?: { data?: string } } }> | undefined)?.[0]?.message?.audio
      ?.data ?? null;
  if (typeof completionAudio === "string" && completionAudio.length > 0) return completionAudio;

  const output = root.output as
    | Array<{ content?: Array<{ type?: string; audio?: string; data?: string }> }>
    | undefined;
  if (Array.isArray(output)) {
    for (const block of output) {
      const content = block?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        if (typeof part.audio === "string" && part.audio.length > 0) return part.audio;
        if (typeof part.data === "string" && part.data.length > 0) return part.data;
      }
    }
  }

  const nestedAudio = root.audio as { data?: string } | undefined;
  if (typeof nestedAudio?.data === "string" && nestedAudio.data.length > 0) return nestedAudio.data;

  return null;
}

function isOpenRouterGptAudioModel(model: string): boolean {
  return model.includes("gpt-audio");
}

function writeAscii(bytes: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    bytes[offset + i] = text.charCodeAt(i);
  }
}

function pcm16ToWavBytes(
  pcmBytes: Uint8Array,
  sampleRate = 24000,
  channels = 1
): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.byteLength;

  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer);

  writeAscii(wav, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(wav, 8, "WAVE");
  writeAscii(wav, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(wav, 36, "data");
  view.setUint32(40, dataSize, true);

  wav.set(pcmBytes, 44);
  return wav;
}

async function requestOpenRouterStreamingPcm16(params: {
  apiKey: string;
  model: string;
  voice: string;
  text: string;
  referer: string;
  title: string;
}): Promise<Uint8Array> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": params.referer,
      "X-Title": params.title
    },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      modalities: ["text", "audio"],
      audio: {
        voice: params.voice,
        format: "pcm16"
      },
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: "user", content: params.text }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter TTS error (${response.status}): ${errorText.slice(0, 300)}`);
  }
  if (!response.body) {
    throw new Error("OpenRouter stream body is empty.");
  }

  const decoder = new TextDecoder();
  let pending = "";
  const audioFragments: string[] = [];

  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });

    while (true) {
      const boundary = pending.indexOf("\n\n");
      if (boundary < 0) break;

      const event = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);

      const lines = event.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { audio?: { data?: string } };
              message?: { audio?: { data?: string } };
            }>;
          };

          const fragment =
            parsed.choices?.[0]?.delta?.audio?.data ??
            parsed.choices?.[0]?.message?.audio?.data;

          if (typeof fragment === "string" && fragment.length > 0) {
            audioFragments.push(fragment);
          }
        } catch {
          // Ignore malformed streaming chunks.
        }
      }
    }
  }

  const joined = audioFragments.join("");
  if (!joined) {
    throw new Error("OpenRouter did not stream audio data.");
  }
  return decodeBase64ToBytes(joined);
}

async function requestOpenAiAudio(params: {
  apiKey: string;
  model: string;
  voice: string;
  format: "mp3" | "wav" | "opus";
  text: string;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      voice: params.voice,
      input: params.text,
      response_format: params.format
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || `audio/${params.format}`;

  return { bytes, contentType };
}

async function requestTogetherAudio(params: {
  apiKey: string;
  model: string;
  voice: string;
  format: "mp3" | "wav";
  text: string;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(`${TOGETHER_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model,
      voice: params.voice,
      input: params.text,
      response_format: params.format
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Together TTS error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || `audio/${params.format}`;

  return { bytes, contentType };
}

async function requestOpenRouterAudio(params: {
  apiKey: string;
  model: string;
  voice: string;
  format: "mp3" | "wav" | "opus";
  text: string;
  referer: string;
  title: string;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (isOpenRouterGptAudioModel(params.model)) {
    const pcmBytes = await requestOpenRouterStreamingPcm16({
      apiKey: params.apiKey,
      model: params.model,
      voice: params.voice,
      text: params.text,
      referer: params.referer,
      title: params.title
    });

    return {
      bytes: pcm16ToWavBytes(pcmBytes),
      contentType: "audio/wav"
    };
  }

  const headers = {
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": params.referer,
    "X-Title": params.title
  };

  const completionResp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      modalities: ["text", "audio"],
      audio: {
        voice: params.voice,
        format: params.format
      },
      temperature: 0,
      messages: [{ role: "user", content: params.text }]
    })
  });

  if (completionResp.ok) {
    const completionPayload = await completionResp.json();
    const base64 = extractAudioBase64(completionPayload);
    if (base64) {
      return {
        bytes: decodeBase64ToBytes(base64),
        contentType: `audio/${params.format}`
      };
    }
  }

  const responseResp = await fetch(`${OPENROUTER_BASE_URL}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      input: params.text,
      modalities: ["text", "audio"],
      audio: {
        voice: params.voice,
        format: params.format
      }
    })
  });

  if (!responseResp.ok) {
    const errorText = await responseResp.text();
    throw new Error(`OpenRouter TTS error (${responseResp.status}): ${errorText.slice(0, 300)}`);
  }

  const responsePayload = await responseResp.json();
  const base64 = extractAudioBase64(responsePayload);
  if (!base64) {
    throw new Error("OpenRouter did not return audio data.");
  }

  return {
    bytes: decodeBase64ToBytes(base64),
    contentType: `audio/${params.format}`
  };
}

async function handleTtsRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const payload = (await request.json().catch(() => null)) as TtsRequestBody | null;
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return json({ error: "Missing text." }, 400);
  }

  const hasOpenAi = Boolean(env.OPENAI_API_KEY);
  const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY);
  const hasTogether = Boolean(env.TOGETHER_API_KEY);
  if (!hasTogether && !hasOpenAi && !hasOpenRouter) {
    return json(
      {
        error:
          "No TTS provider configured. Set TOGETHER_API_KEY (preferred), OPENAI_API_KEY, or OPENROUTER_API_KEY."
      },
      503
    );
  }

  const requestedProvider = normalizeProvider(payload?.provider);
  const providerOrder: TtsProvider[] = [];
  if (requestedProvider === "together" && hasTogether) providerOrder.push("together");
  if (requestedProvider === "openai" && hasOpenAi) providerOrder.push("openai");
  if (requestedProvider === "openrouter" && hasOpenRouter) providerOrder.push("openrouter");
  if (hasTogether && !providerOrder.includes("together")) providerOrder.push("together");
  if (hasOpenAi && !providerOrder.includes("openai")) providerOrder.push("openai");
  if (hasOpenRouter && !providerOrder.includes("openrouter")) providerOrder.push("openrouter");

  const togetherVoice = normalizeVoice(payload?.voice, env.TOGETHER_TTS_VOICE || DEFAULT_TOGETHER_TTS_VOICE);
  const togetherFormat = normalizeTogetherFormat(payload?.format ?? env.TOGETHER_TTS_FORMAT);
  const togetherModel = env.TOGETHER_TTS_MODEL || DEFAULT_TOGETHER_TTS_MODEL;
  const openAiVoice = normalizeVoice(payload?.voice, env.OPENAI_TTS_VOICE || DEFAULT_VOICE);
  const openRouterVoice = normalizeVoice(payload?.voice, env.OPENROUTER_TTS_VOICE || DEFAULT_VOICE);
  const openAiFormat = normalizeFormat(payload?.format ?? env.OPENAI_TTS_FORMAT);
  const openRouterFormat = normalizeFormat(payload?.format ?? env.OPENROUTER_TTS_FORMAT);
  const openAiModel = env.OPENAI_TTS_MODEL || DEFAULT_OPENAI_TTS_MODEL;
  const openRouterModel = env.OPENROUTER_TTS_MODEL || DEFAULT_OPENROUTER_TTS_MODEL;
  const openRouterModelCandidates = uniqueValues([
    openRouterModel,
    DEFAULT_OPENROUTER_TTS_MODEL
  ]);

  const errors: string[] = [];

  for (const provider of providerOrder) {
    try {
      let result: { bytes: Uint8Array; contentType: string } | null = null;

      if (provider === "together") {
        result = await requestTogetherAudio({
          apiKey: env.TOGETHER_API_KEY!,
          model: togetherModel,
          voice: togetherVoice,
          format: togetherFormat,
          text
        });
      } else if (provider === "openai") {
        result = await requestOpenAiAudio({
          apiKey: env.OPENAI_API_KEY!,
          model: openAiModel,
          voice: openAiVoice,
          format: openAiFormat,
          text
        });
      } else {
        for (const modelCandidate of openRouterModelCandidates) {
          try {
            result = await requestOpenRouterAudio({
              apiKey: env.OPENROUTER_API_KEY!,
              model: modelCandidate,
              voice: openRouterVoice,
              format: openRouterFormat,
              text,
              referer: env.OPENROUTER_SITE_URL || new URL(request.url).origin,
              title: env.OPENROUTER_APP_NAME || "Gaze Direction Tracker"
            });
            break;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown OpenRouter TTS error";
            errors.push(`[openrouter:${modelCandidate}] ${message}`);
          }
        }
      }

      if (!result) {
        continue;
      }

      return new Response(new Blob([result.bytes], { type: result.contentType }), {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": "no-store",
          "X-TTS-Provider": provider,
          ...CORS_HEADERS
        }
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown TTS error");
    }
  }

  return json({ error: errors.join(" | ") || "TTS request failed." }, 502);
}

async function handleTranscribeRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  if (!env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY is required for transcription." }, 503);
  }

  const incoming = await request.formData().catch(() => null);
  const audio = incoming?.get("audio");
  if (!(audio instanceof File)) {
    return json({ error: "Missing audio file. Send multipart/form-data with 'audio'." }, 400);
  }

  const model =
    typeof incoming.get("model") === "string" && incoming.get("model")
      ? String(incoming.get("model"))
      : env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL;

  const upstreamForm = new FormData();
  upstreamForm.set("file", audio, audio.name || "audio.webm");
  upstreamForm.set("model", model);

  const language = incoming.get("language");
  if (typeof language === "string" && language.trim()) {
    upstreamForm.set("language", language.trim());
  }

  const prompt = incoming.get("prompt");
  if (typeof prompt === "string" && prompt.trim()) {
    upstreamForm.set("prompt", prompt.trim());
  }

  const upstreamResp = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: upstreamForm
  });

  const bodyText = await upstreamResp.text();
  if (!upstreamResp.ok) {
    return json({ error: `OpenAI transcription error (${upstreamResp.status}): ${bodyText.slice(0, 300)}` }, 502);
  }

  return new Response(bodyText, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS
    }
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/tts") {
      return handleTtsRequest(request, env);
    }
    if (url.pathname === "/api/transcribe") {
      return handleTranscribeRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
