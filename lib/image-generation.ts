import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { AppError } from './app-error';

const execFileAsync = promisify(execFile);
const infshBin = process.env.INFSH_BIN || 'infsh';
const infshPathEnv = `${process.env.HOME || ''}/.local/bin:${process.env.PATH || ''}`;
const CONFIGURED_GEMINI_IMAGE_MODEL = process.env.KID_CHAT_IMAGE_MODEL?.trim() || '';
const DEFAULT_MEDIA_AGENT_ID = process.env.KID_CHAT_MEDIA_AGENT_ID || 'media';

export type ImageGenerationProviderId = 'media-agent' | 'gemini-direct' | 'inference-sh';

export type GeneratedImageResult = {
  prompt: string;
  revisedPrompt?: string;
  description?: string;
  images: string[];
  provider: ImageGenerationProviderId;
  model: string;
};

export type ImageGenerationParams = {
  prompt: string;
  aspectRatio?: string;
  resolution?: '1K' | '2K' | '4K';
  referenceImages?: Array<{ filePath?: string; url?: string; contentType?: string }>;
};

export type ImageGenerationSmokeTestResult = {
  ok: true;
  provider: ImageGenerationProviderId;
  model: string;
  prompt: string;
  imageCount: number;
  firstImagePreview: string;
  elapsedMs: number;
  description: string;
  debug?: Record<string, unknown>;
};

function getConfiguredImageProvider(): ImageGenerationProviderId {
  const raw = (process.env.KID_CHAT_IMAGE_PROVIDER || 'media-agent').trim().toLowerCase();
  if (raw === 'inference-sh') return 'inference-sh';
  if (raw === 'gemini-direct') return 'gemini-direct';
  return 'media-agent';
}

function extractImageUrls(output: unknown): string[] {
  if (!output || typeof output !== 'object') return [];
  const record = output as Record<string, unknown>;
  if (Array.isArray(record.images)) {
    return record.images
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const maybe = item as Record<string, unknown>;
          return [maybe.url, maybe.uri, maybe.image_url, maybe.imageUrl].find((value) => typeof value === 'string') as string | undefined;
        }
        return undefined;
      })
      .filter((value): value is string => Boolean(value));
  }
  return [];
}

async function generateImageWithInferenceSh(params: ImageGenerationParams): Promise<GeneratedImageResult> {
  const input = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio || '1:1',
    resolution: params.resolution || '1K',
    num_images: 1,
    ...(params.referenceImages?.length ? { images: params.referenceImages.map((item) => item.url || item.filePath).filter(Boolean) } : {}),
  };

  try {
    const { stdout } = await execFileAsync(
      infshBin,
      ['app', 'run', 'google/gemini-3-1-flash-image-preview', '--input', JSON.stringify(input), '--json'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: infshPathEnv,
        },
        maxBuffer: 1024 * 1024 * 20,
      },
    );

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const output = (parsed.output || parsed.result || parsed.data || parsed) as Record<string, unknown>;
    const images = extractImageUrls(output);

    if (images.length === 0) {
      throw new AppError('生图完成了，但没有拿到图片输出。', 502);
    }

    return {
      prompt: params.prompt,
      revisedPrompt: typeof output.revised_prompt === 'string' ? output.revised_prompt : undefined,
      description: typeof output.description === 'string' ? output.description : undefined,
      images,
      provider: 'inference-sh',
      model: 'google/gemini-3-1-flash-image-preview',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (/401|unauthorized|invalid credentials/i.test(message)) {
      throw new AppError('当前生图后端配置为 inference.sh，但它还没有登录。可改用 media-agent 或 Gemini 直连，或先运行 `infsh login`。', 500);
    }

    if (/ENOENT|command not found/i.test(message)) {
      throw new AppError('当前生图后端配置为 inference.sh，但系统里找不到 infsh 命令。', 500);
    }

    if (error instanceof AppError) throw error;
    throw new AppError(`调用 inference.sh 生图失败：${message}`, 502);
  }
}

let cachedDotEnvValues: Record<string, string> | null = null;

async function readOpenClawDotEnv() {
  if (cachedDotEnvValues) return cachedDotEnvValues;

  try {
    const raw = await fs.readFile('/Users/jason/.openclaw/.env', 'utf8');
    const values: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      values[key] = value.replace(/^['"]|['"]$/g, '');
    }
    cachedDotEnvValues = values;
    return values;
  } catch {
    cachedDotEnvValues = {};
    return cachedDotEnvValues;
  }
}

async function getGeminiApiKey() {
  const envKey = process.env.KID_CHAT_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (envKey) return envKey;
  const dotEnv = await readOpenClawDotEnv();
  return dotEnv.KID_CHAT_GEMINI_API_KEY || dotEnv.GEMINI_API_KEY || dotEnv.GOOGLE_API_KEY || '';
}

function mapAspectRatioToSize(aspectRatio?: string) {
  switch ((aspectRatio || '1:1').trim()) {
    case '16:9': return '1536x864';
    case '9:16': return '864x1536';
    case '4:3': return '1280x960';
    case '3:4': return '960x1280';
    default: return '1024x1024';
  }
}

async function generateImageWithGeminiDirect(params: ImageGenerationParams): Promise<GeneratedImageResult> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new AppError('Gemini 直连生图需要 API key。请设置 `KID_CHAT_GEMINI_API_KEY`（或 `GEMINI_API_KEY` / `GOOGLE_API_KEY`）。', 500);
  }
  if (!CONFIGURED_GEMINI_IMAGE_MODEL) {
    throw new AppError('Gemini 直连生图需要显式配置 `KID_CHAT_IMAGE_MODEL`，不再使用代码内默认模型名。', 500);
  }
  if (params.referenceImages?.length) {
    throw new AppError('Gemini 直连第一版暂时只通过 media agent 走图生图，当前 direct fallback 不处理参考图改图。', 501);
  }

  const model = CONFIGURED_GEMINI_IMAGE_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestedSize = mapAspectRatioToSize(params.aspectRatio);
  const prompt = [
    'Generate exactly one child-friendly image.',
    'Return image output, not only text.',
    'Prefer bright, warm, friendly, safe visual style unless the prompt asks otherwise.',
    `Target size: ${requestedSize}.`,
    `User prompt: ${params.prompt}`,
  ].join('\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new AppError(`调用 Gemini 直连生图失败：${raw || `HTTP ${response.status}`}`, 502);
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new AppError('Gemini 生图返回了无法解析的响应。', 502); }

  const candidates = (parsed as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> }).candidates || [];
  const parts = candidates.flatMap((candidate) => candidate.content?.parts || []);
  const images = parts.map((part) => {
    const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined;
    return inlineData?.data ? `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}` : null;
  }).filter((value): value is string => Boolean(value));

  const description = parts.map((part) => (typeof part.text === 'string' ? part.text.trim() : '')).filter(Boolean).join('\n') || undefined;
  if (images.length === 0) throw new AppError('Gemini 生图返回成功，但没有拿到图片数据。', 502);

  return { prompt: params.prompt, description, images, provider: 'gemini-direct', model };
}

function stripFenceBlock(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractJsonObject(text: string) {
  const trimmed = stripFenceBlock(text).trim();
  if (!trimmed) return '';

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // keep searching for an embedded JSON object
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = trimmed.slice(start, i + 1).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          start = -1;
        }
      }
    }
  }

  return trimmed;
}

async function invokeMediaAgentRaw(params: ImageGenerationParams) {
  const requestedSize = mapAspectRatioToSize(params.aspectRatio);
  const referenceBlock = params.referenceImages?.length
    ? [
        '',
        'This is an image-edit request. Use the reference image below as the source image and apply the requested edit.',
        ...params.referenceImages.flatMap((item, index) => [
          `Reference image ${index + 1} file path: ${item.filePath || '(not provided)'}`,
          `Reference image ${index + 1} url: ${item.url || '(not provided)'}`,
          `Reference image ${index + 1} content type: ${item.contentType || '(unknown)'}`,
        ]),
      ]
    : [];
  const agentPrompt = [
    'You are a media generation agent for Kid Chat MVP.',
    params.referenceImages?.length
      ? 'Edit the provided reference image and generate exactly one child-friendly result image for the request below.'
      : 'Generate exactly one child-friendly image for the request below.',
    'Use your default configured image-generation workflow and default model settings.',
    'Do not switch to a different provider, model, or tool unless the default workflow is unavailable.',
    'Do not output thinking, reasoning, explanations, markdown, or code fences.',
    'Return exactly one JSON object and nothing else.',
    'Return JSON only with this exact shape:',
    '{',
    '  "ok": true,',
    '  "provider": "string",',
    '  "model": "string",',
    '  "prompt": "string",',
    '  "revisedPrompt": "string (optional)",',
    '  "summary": "string (optional)",',
    '  "images": ["https://..." or "data:image/...;base64,..."]',
    '}',
    'If generation fails, return JSON only with:',
    '{ "ok": false, "error": "reason" }',
    '',
    `Requested size: ${requestedSize}`,
    `Child request: ${params.prompt}`,
    ...referenceBlock,
  ].join('\n');

  try {
    const { stdout, stderr } = await execFileAsync('openclaw', ['agent', '--agent', DEFAULT_MEDIA_AGENT_ID, '--message', agentPrompt, '--json'], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 20,
      timeout: 180000,
    });

    const parsed = JSON.parse(stdout) as {
      result?: {
        payloads?: Array<{ text?: string | null }>;
        meta?: { agentMeta?: { model?: string; provider?: string } };
      };
    };

    const text = stripFenceBlock(parsed.result?.payloads?.map((item) => item.text || '').join('\n').trim() || '');
    return { ok: true as const, stdout, stderr, parsed, text, exitCode: 0 };
  } catch (error) {
    const e = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    const timeoutHint = /timed out|killed/i.test(e.message || '')
      ? ' (可能是 agent 执行超时)'
      : '';
    return {
      ok: false as const,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      parsed: null,
      text: '',
      exitCode: typeof e.code === 'number' ? e.code : null,
      errorMessage: `${e.message || 'Unknown error'}${timeoutHint}`,
    };
  }
}

async function generateImageWithMediaAgent(params: ImageGenerationParams): Promise<GeneratedImageResult> {
  const result = await invokeMediaAgentRaw(params);
  if (!result.ok) {
    throw new AppError(
      `media agent 执行失败（exit=${result.exitCode ?? 'unknown'}）：${result.errorMessage}\nSTDERR: ${(result.stderr || '').slice(0, 500)}\nSTDOUT: ${(result.stdout || '').slice(0, 500)}`,
      502,
    );
  }

  const { parsed, text } = result;
  if (!text) throw new AppError('media agent 返回了空结果。', 502);

  const extractedJson = extractJsonObject(text);

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(extractedJson) as Record<string, unknown>;
  } catch {
    throw new AppError(`media agent 返回了非 JSON 结果：${text.slice(0, 300)}`, 502);
  }
  if (json.ok === false) throw new AppError(`media agent 生图失败：${typeof json.error === 'string' ? json.error : 'unknown error'}`, 502);

  const images = extractImageUrls(json);
  if (images.length === 0) throw new AppError('media agent 返回成功，但没有图片输出。', 502);

  return {
    prompt: typeof json.prompt === 'string' ? json.prompt : params.prompt,
    revisedPrompt: typeof json.revisedPrompt === 'string' ? json.revisedPrompt : undefined,
    description: typeof json.summary === 'string' ? json.summary : undefined,
    images,
    provider: 'media-agent',
    model: typeof json.model === 'string' ? json.model : parsed?.result?.meta?.agentMeta?.model || DEFAULT_MEDIA_AGENT_ID,
  };
}

export async function generateImage(params: ImageGenerationParams): Promise<GeneratedImageResult> {
  const provider = getConfiguredImageProvider();
  if (provider === 'inference-sh') return generateImageWithInferenceSh(params);
  if (provider === 'gemini-direct') return generateImageWithGeminiDirect(params);

  let mediaError: unknown = null;
  try {
    return await generateImageWithMediaAgent(params);
  } catch (error) {
    mediaError = error;
    if (error instanceof AppError && params.referenceImages?.length) throw error;
  }

  try {
    return await generateImageWithGeminiDirect(params);
  } catch (geminiError) {
    const mediaMessage = mediaError instanceof Error ? mediaError.message : String(mediaError || 'unknown error');
    const geminiMessage = geminiError instanceof Error ? geminiError.message : String(geminiError || 'unknown error');
    throw new AppError(
      `图片生成失败。\n智媒错误：${mediaMessage}\nGemini fallback 错误：${geminiMessage}`,
      geminiError instanceof AppError ? geminiError.status : 502,
    );
  }
}

export async function readImageGenerationRuntimeConfig() {
  return {
    provider: getConfiguredImageProvider(),
    model: getConfiguredImageProvider() === 'media-agent' ? DEFAULT_MEDIA_AGENT_ID : (CONFIGURED_GEMINI_IMAGE_MODEL || '(not configured)'),
    hasGeminiApiKey: Boolean(await getGeminiApiKey()),
    hasGeminiImageModel: Boolean(CONFIGURED_GEMINI_IMAGE_MODEL),
  };
}

export async function runImageGenerationSmokeTest(): Promise<ImageGenerationSmokeTestResult> {
  const prompt = 'A friendly yellow star with a smiling face, child-friendly illustration, simple clean background';
  const startedAt = Date.now();
  const result = await generateImage({ prompt, aspectRatio: '1:1' });
  return {
    ok: true,
    provider: result.provider,
    model: result.model,
    prompt,
    imageCount: result.images.length,
    firstImagePreview: result.images[0]?.slice(0, 80) || '',
    elapsedMs: Date.now() - startedAt,
    description: result.description || '',
  };
}

export async function runMediaAgentSmokeTest(): Promise<ImageGenerationSmokeTestResult> {
  const prompt = 'A friendly yellow star with a smiling face, child-friendly illustration, simple clean background';
  const startedAt = Date.now();
  const result = await invokeMediaAgentRaw({ prompt, aspectRatio: '1:1' });

  if (!result.ok) {
    throw new AppError(
      `media agent 执行失败（exit=${result.exitCode ?? 'unknown'}）：${result.errorMessage}\nSTDERR: ${(result.stderr || '').slice(0, 1200)}\nSTDOUT: ${(result.stdout || '').slice(0, 1200)}`,
      502,
    );
  }

  const { stdout, stderr, parsed, text } = result;
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { json = null; }
  const images = json ? extractImageUrls(json) : [];

  if (!json) throw new AppError(`media agent 返回了非 JSON 结果：${text.slice(0, 300)}`, 502);
  if (json.ok === false) throw new AppError(`media agent 生图失败：${typeof json.error === 'string' ? json.error : 'unknown error'}`, 502);
  if (images.length === 0) throw new AppError(`media agent 返回成功但没有图片。原始返回：${text.slice(0, 500)}`, 502);

  return {
    ok: true,
    provider: 'media-agent',
    model: typeof json.model === 'string' ? json.model : parsed?.result?.meta?.agentMeta?.model || DEFAULT_MEDIA_AGENT_ID,
    prompt,
    imageCount: images.length,
    firstImagePreview: images[0]?.slice(0, 80) || '',
    elapsedMs: Date.now() - startedAt,
    description: typeof json.summary === 'string' ? json.summary : '',
    debug: {
      rawTextPreview: text.slice(0, 800),
      stdoutPreview: stdout.slice(0, 800),
      stderrPreview: (stderr || '').slice(0, 800),
    },
  };
}

export async function runGeminiDirectSmokeTest(): Promise<ImageGenerationSmokeTestResult> {
  const prompt = 'A friendly yellow star with a smiling face, child-friendly illustration, simple clean background';
  const startedAt = Date.now();
  const result = await generateImageWithGeminiDirect({ prompt, aspectRatio: '1:1' });
  return {
    ok: true,
    provider: 'gemini-direct',
    model: result.model,
    prompt,
    imageCount: result.images.length,
    firstImagePreview: result.images[0]?.slice(0, 80) || '',
    elapsedMs: Date.now() - startedAt,
    description: result.description || '',
  };
}

export async function tryReadGoogleApiKeyFromOpenClawConfig() {
  try {
    const raw = await fs.readFile('/Users/jason/.openclaw/openclaw.json', 'utf8');
    if (/provider:\s*'google'/.test(raw) || /"provider"\s*:\s*"google"/.test(raw)) return 'configured-externally';
  } catch {}
  return null;
}
