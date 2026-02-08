import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ENV_FILE = ".dev.vars";
const DEFAULT_TEXT =
  "Hello from the gaze direction tracker. This audio was generated with OpenRouter text to speech.";

function parseEnvFile(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in out)) {
      out[key] = value;
    }
  }
  return out;
}

async function loadEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return parseEnvFile(raw);
  } catch {
    return {};
  }
}

function pickValue(envMap, key, fallback = "") {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  const fromFile = envMap[key];
  if (typeof fromFile === "string" && fromFile.trim()) return fromFile.trim();
  return fallback;
}

function isGptAudioModel(model) {
  return model.includes("gpt-audio");
}

function extractAudioBase64(payload) {
  const completionAudio = payload?.choices?.[0]?.message?.audio?.data;
  if (typeof completionAudio === "string" && completionAudio.length > 0) return completionAudio;

  const output = payload?.output;
  if (Array.isArray(output)) {
    for (const block of output) {
      const content = block?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part?.audio === "string" && part.audio.length > 0) return part.audio;
        if (typeof part?.data === "string" && part.data.length > 0) return part.data;
      }
    }
  }

  return null;
}

function pcm16ToWavBytes(pcmBytes, sampleRate = 24000, channels = 1) {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBytes]);
}

async function requestStreamingPcm16Base64({ headers, model, voice, text }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      modalities: ["text", "audio"],
      audio: {
        voice,
        format: "pcm16"
      },
      temperature: 0,
      max_tokens: 120,
      messages: [{ role: "user", content: text }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter TTS failed (${response.status}): ${errorText.slice(0, 400)}`);
  }

  if (!response.body) {
    throw new Error("OpenRouter stream body is empty.");
  }

  const decoder = new TextDecoder();
  let pending = "";
  const audioFragments = [];

  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });

    while (true) {
      const eventEnd = pending.indexOf("\n\n");
      if (eventEnd < 0) break;

      const eventBlock = pending.slice(0, eventEnd);
      pending = pending.slice(eventEnd + 2);

      const lines = eventBlock.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const fragment =
          parsed?.choices?.[0]?.delta?.audio?.data ??
          parsed?.choices?.[0]?.message?.audio?.data ??
          null;

        if (typeof fragment === "string" && fragment.length > 0) {
          audioFragments.push(fragment);
        }
      }
    }
  }

  return audioFragments.join("");
}

async function requestNonStreamingAudioBase64({ headers, model, voice, format, text }) {
  let base64 = null;

  const completionResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      modalities: ["text", "audio"],
      audio: {
        voice,
        format
      },
      temperature: 0,
      messages: [{ role: "user", content: text }]
    })
  });

  if (completionResponse.ok) {
    const completionPayload = await completionResponse.json();
    base64 = extractAudioBase64(completionPayload);
  }

  if (!base64) {
    const responsesApiResponse = await fetch("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: text,
        modalities: ["text", "audio"],
        audio: {
          voice,
          format
        }
      })
    });

    if (!responsesApiResponse.ok) {
      const errorText = await responsesApiResponse.text();
      throw new Error(
        `OpenRouter TTS failed (${responsesApiResponse.status}): ${errorText.slice(0, 400)}`
      );
    }

    const responsesPayload = await responsesApiResponse.json();
    base64 = extractAudioBase64(responsesPayload);
  }

  if (!base64) {
    throw new Error("OpenRouter response did not include audio data.");
  }

  return base64;
}

async function main() {
  const envFilePath = process.env.TTS_ENV_FILE || DEFAULT_ENV_FILE;
  const envMap = await loadEnvFile(envFilePath);

  const apiKey = pickValue(envMap, "OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error(
      `Missing OPENROUTER_API_KEY. Add it to ${envFilePath} or export it in your shell.`
    );
  }

  const model = pickValue(envMap, "OPENROUTER_TTS_MODEL", "openai/gpt-audio-mini");
  const voice = pickValue(envMap, "OPENROUTER_TTS_VOICE", "alloy");

  const envFormat = pickValue(envMap, "OPENROUTER_TTS_FORMAT", "").toLowerCase();
  const format = isGptAudioModel(model) ? "pcm16" : envFormat || "mp3";

  const referer = pickValue(envMap, "OPENROUTER_SITE_URL", "https://localhost");
  const title = pickValue(envMap, "OPENROUTER_APP_NAME", "Gaze Direction Tracker");

  const text = process.argv.slice(2).join(" ").trim() || DEFAULT_TEXT;
  const extension = format === "pcm16" ? "wav" : format;
  const outputPath =
    process.env.TTS_OUTPUT_PATH || path.join("dev-dist", `tts-openrouter-example.${extension}`);

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": title
  };

  let audioBytes;

  if (format === "pcm16") {
    const base64 = await requestStreamingPcm16Base64({
      headers,
      model,
      voice,
      text
    });

    if (!base64) {
      throw new Error("Streaming response did not include audio chunks.");
    }

    const pcmBytes = Buffer.from(base64.replace(/\s+/g, ""), "base64");
    audioBytes = pcm16ToWavBytes(pcmBytes, 24000, 1);
  } else {
    const base64 = await requestNonStreamingAudioBase64({
      headers,
      model,
      voice,
      format,
      text
    });
    audioBytes = Buffer.from(base64.replace(/\s+/g, ""), "base64");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, audioBytes);

  console.log(`Saved TTS example to ${outputPath}`);
  console.log(`Model: ${model}`);
  console.log(`Voice: ${voice}`);
  console.log(`Format: ${format}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
