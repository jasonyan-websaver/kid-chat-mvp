import { execFile } from 'child_process';
import type { ExecFileException } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { AppError } from './app-error';

const execFileAsync = promisify(execFile);
const infshBin = process.env.INFSH_BIN || 'infsh';
const infshPathEnv = `${process.env.HOME || ''}/.local/bin:${process.env.PATH || ''}`;
const CONFIGURED_GEMINI_IMAGE_MODEL = process.env.KID_CHAT_IMAGE_MODEL?.trim() || '';

function normalizeGoogleModelName(model: string) {
  return model.replace(/^google\//, '');
}
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
  mediaAgentExtraInstructions?: string[];
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

export type MediaAgentInvocationFailureDebug = {
  exitCode: number | null;
  signal?: string | null;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutPreview: string;
  stderrPreview: string;
  parsedTextPreview: string;
  requestedSize: string;
  mediaAgentId: string;
  hint?: string;
};

type MediaAgentInvocationSuccess = {
  ok: true;
  stdout: string;
  stderr: string;
  parsed: {
    result?: {
      payloads?: Array<{ text?: string | null }>;
      meta?: { agentMeta?: { model?: string; provider?: string } };
    };
  };
  text: string;
  exitCode: 0;
  debug?: undefined;
};

type MediaAgentInvocationFailure = {
  ok: false;
  stdout: string;
  stderr: string;
  parsed: null;
  text: string;
  exitCode: number | null;
  errorMessage: string;
  debug: MediaAgentInvocationFailureDebug;
};

type MediaAgentInvocationResult = MediaAgentInvocationSuccess | MediaAgentInvocationFailure;

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

async function loadReferenceImageAsInlineData(reference: { filePath?: string; url?: string; contentType?: string }) {
  let buffer: Buffer;
  let mimeType = reference.contentType || 'image/png';

  if (reference.filePath) {
    buffer = await fs.readFile(reference.filePath);
  } else if (reference.url?.startsWith('/')) {
    const sourcePath = `${process.cwd()}/public/${reference.url.replace(/^\//, '')}`;
    buffer = await fs.readFile(sourcePath);
  } else if (reference.url?.startsWith('data:')) {
    const match = reference.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new AppError('Gemini 图改图收到的参考图 data URL 无法解析。', 400);
    }
    mimeType = match[1] || mimeType;
    buffer = Buffer.from(match[2], 'base64');
  } else if (reference.url) {
    const response = await fetch(reference.url);
    if (!response.ok) {
      throw new AppError(`Gemini 图改图下载参考图失败：HTTP ${response.status}`, 502);
    }
    mimeType = response.headers.get('content-type') || mimeType;
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new AppError('Gemini 图改图缺少参考图片。', 400);
  }

  return {
    inlineData: {
      mimeType,
      data: buffer.toString('base64'),
    },
  };
}

async function generateImageWithGeminiDirect(params: ImageGenerationParams): Promise<GeneratedImageResult> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new AppError('Gemini 直连生图需要 API key。请设置 `KID_CHAT_GEMINI_API_KEY`（或 `GEMINI_API_KEY` / `GOOGLE_API_KEY`）。', 500);
  }
  if (!CONFIGURED_GEMINI_IMAGE_MODEL) {
    throw new AppError('Gemini 直连生图需要显式配置 `KID_CHAT_IMAGE_MODEL`，不再使用代码内默认模型名。', 500);
  }

  const model = normalizeGoogleModelName(CONFIGURED_GEMINI_IMAGE_MODEL);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const requestedSize = mapAspectRatioToSize(params.aspectRatio);
  const isEdit = Boolean(params.referenceImages?.length);
  const prompt = [
    isEdit ? 'Edit the provided reference image and generate exactly one child-friendly result image.' : 'Generate exactly one child-friendly image.',
    'Return image output, not only text.',
    'Prefer bright, warm, friendly, safe visual style unless the prompt asks otherwise.',
    `Target size: ${requestedSize}.`,
    isEdit
      ? `Edit instruction: ${params.prompt}`
      : `User prompt: ${params.prompt}`,
  ].join('\n');

  const referenceParts = params.referenceImages?.length
    ? await Promise.all(params.referenceImages.map((reference) => loadReferenceImageAsInlineData(reference)))
    : [];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...referenceParts] }],
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

function previewText(value: string, max = 1200) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function buildMediaAgentFailureHint(message: string, stdout: string, stderr: string) {
  if (/maxBuffer|maxBuffer length exceeded/i.test(message)) {
    return '智媒返回的数据过大，可能是把整张图片以内联 base64 直接塞进 JSON 了；优先让它返回更紧凑的 URL 型结果会更稳。';
  }
  if (/timed out|killed/i.test(message)) {
    return '智媒调用超时了，可能是默认生图工作流太慢，或者中途卡住。';
  }
  if (!stdout.trim() && !stderr.trim()) {
    return '智媒进程提前退出，而且没有任何标准输出/错误输出；这更像是默认工作流内部失败，而不是前端解析失败。';
  }
  return undefined;
}

function buildMediaAgentFailureDebug(error: ExecFileException & { stdout?: string; stderr?: string }, requestedSize: string): MediaAgentInvocationFailureDebug {
  const stdout = error.stdout || '';
  const stderr = error.stderr || '';
  const combinedPreview = previewText(stripFenceBlock(stdout).trim() || stdout || stderr, 1200);
  return {
    exitCode: typeof error.code === 'number' ? error.code : null,
    signal: error.signal || null,
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(stderr, 'utf8'),
    stdoutPreview: previewText(stdout),
    stderrPreview: previewText(stderr),
    parsedTextPreview: combinedPreview,
    requestedSize,
    mediaAgentId: DEFAULT_MEDIA_AGENT_ID,
    hint: buildMediaAgentFailureHint(error.message || '', stdout, stderr),
  };
}

function collectStringLeaves(value: unknown, out: string[] = []) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) collectStringLeaves(entry, out);
  }
  return out;
}

function looksLikeMediaAgentResultJson(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== 'boolean') return false;
  if (record.ok === false && typeof record.error === 'string') return true;
  return Array.isArray(record.images) && typeof record.model === 'string';
}

function findMediaAgentResultJsonCandidate(...sources: string[]) {
  for (const source of sources) {
    const text = source?.trim();
    if (!text) continue;
    const extracted = extractJsonObject(text);
    if (!extracted) continue;
    try {
      const parsed = JSON.parse(extracted) as unknown;
      if (looksLikeMediaAgentResultJson(parsed)) return extracted;
    } catch {
      // keep searching
    }
  }
  return '';
}

async function copyFileIntoSmokeTests(sourcePath: string, targetPath: string) {
  const targetDir = targetPath.split('/').slice(0, -1).join('/');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function invokeMediaAgentRaw(params: ImageGenerationParams): Promise<MediaAgentInvocationResult> {
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
    'Keep the response compact. Prefer saving the generated image to a local file and returning the absolute file path.',
    'Do not output thinking, reasoning, explanations, markdown, or code fences.',
    'Return exactly one JSON object and nothing else.',
    'Preferred JSON shape:',
    '{',
    '  "model": "string",',
    '  "image_location": "/absolute/path/to/generated-image.png",',
    '  "image_dimensions": "1024 x 1024",',
    '  "revisedPrompt": "string (optional)",',
    '  "summary": "string (optional)"',
    '}',
    'Fallback legacy JSON shape if your default workflow cannot provide a local file path:',
    '{',
    '  "ok": true,',
    '  "provider": "string",',
    '  "model": "string",',
    '  "prompt": "string",',
    '  "revisedPrompt": "string (optional)",',
    '  "summary": "string (optional)",',
    '  "images": ["https://..." or "/smoke-tests/..."]',
    '}',
    'If generation fails, return JSON only with:',
    '{ "ok": false, "error": "reason" }',
    '',
    `Requested size: ${requestedSize}`,
    `Child request: ${params.prompt}`,
    ...(params.mediaAgentExtraInstructions || []),
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

    const payloadText = stripFenceBlock(parsed.result?.payloads?.map((item) => item.text || '').join('\n').trim() || '');
    const allStringLeaves = collectStringLeaves(parsed);
    const candidateJson = findMediaAgentResultJsonCandidate(payloadText, ...allStringLeaves, stdout);
    const text = candidateJson || payloadText;
    return { ok: true as const, stdout, stderr, parsed, text, exitCode: 0, debug: undefined };
  } catch (error) {
    const e = error as ExecFileException & { stdout?: string; stderr?: string };
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
      debug: buildMediaAgentFailureDebug(e, requestedSize),
    };
  }
}

async function generateImageWithMediaAgent(params: ImageGenerationParams): Promise<GeneratedImageResult> {
  const result = await invokeMediaAgentRaw(params);
  if (!result.ok) {
    const hint = result.debug?.hint ? `\nHint: ${result.debug.hint}` : '';
    throw new AppError(
      `media agent 执行失败（exit=${result.exitCode ?? 'unknown'}）：${result.errorMessage}${hint}\nSTDERR: ${(result.stderr || '').slice(0, 500)}\nSTDOUT: ${(result.stdout || '').slice(0, 500)}`,
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

  const localImagePath = typeof json.image_location === 'string' ? json.image_location.trim() : '';
  const localImageExists = localImagePath ? await fs.access(localImagePath).then(() => true).catch(() => false) : false;
  const images = localImageExists ? [localImagePath] : extractImageUrls(json);
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
    firstImagePreview: result.images[0] || '',
    elapsedMs: Date.now() - startedAt,
    description: result.description || '',
  };
}

export async function runMediaAgentSmokeTest(): Promise<ImageGenerationSmokeTestResult> {
  const prompt = 'A friendly yellow star with a smiling face, child-friendly illustration, simple clean background';
  const startedAt = Date.now();
  const smokeDir = `${process.cwd()}/public/smoke-tests`;
  const smokeFilename = `media-smoke-${Date.now()}.png`;
  const smokeFilePath = `${smokeDir}/${smokeFilename}`;
  const smokePublicUrl = `/smoke-tests/${smokeFilename}`;
  await fs.mkdir(smokeDir, { recursive: true });
  const result = await invokeMediaAgentRaw({
    prompt,
    aspectRatio: '1:1',
    mediaAgentExtraInstructions: [
      '',
      'IMPORTANT FOR THIS SMOKE TEST:',
      'Return one minimal JSON object only, with this exact shape:',
      '{',
      '  "model": "string",',
      '  "image_location": "/absolute/path/to/generated-image.png",',
      '  "image_dimensions": "1024 x 1024"',
      '}',
      'Do not return prompt, revisedPrompt, summary, markdown, code fences, or any data:image/base64 payload.',
      'The image must be saved to a local file first. image_location must be an absolute filesystem path to the generated image file.',
      'Keep the JSON tiny to avoid truncation.',
    ],
  });

  if (!result.ok) {
    const failed = result as MediaAgentInvocationFailure;
    const debug = failed.debug || {
      exitCode: failed.exitCode ?? null,
      stdoutPreview: previewText(failed.stdout || ''),
      stderrPreview: previewText(failed.stderr || ''),
      requestedSize: 'unknown',
      mediaAgentId: DEFAULT_MEDIA_AGENT_ID,
    };
    const hint = failed.debug?.hint ? `\nHint: ${failed.debug.hint}` : '';
    throw new AppError(
      `media agent 执行失败（exit=${failed.exitCode ?? 'unknown'}）：${failed.errorMessage}${hint}\nSTDERR: ${(failed.stderr || '').slice(0, 1200)}\nSTDOUT: ${(failed.stdout || '').slice(0, 1200)}\nDEBUG: ${JSON.stringify(debug)}`,
      502,
    );
  }

  const { stdout, stderr, parsed, text } = result;
  const extractedJson = extractJsonObject(text);
  let json: Record<string, unknown> | null = null;
  try { json = extractedJson ? JSON.parse(extractedJson) as Record<string, unknown> : null; } catch { json = null; }

  const candidateImageLocation = typeof json?.image_location === 'string' ? json.image_location.trim() : '';
  const localSmokeFileExists = await fs.access(smokeFilePath).then(() => true).catch(() => false);
  const sourceImageExists = candidateImageLocation ? await fs.access(candidateImageLocation).then(() => true).catch(() => false) : false;

  if (json && typeof json.ok === 'boolean' && json.ok === false) {
    throw new AppError(`media agent 生图失败：${typeof json.error === 'string' ? json.error : 'unknown error'}`, 502);
  }

  if (!json) {
    throw new AppError(`media agent 返回了非 JSON 结果：${text.slice(0, 300)}`, 502);
  }

  if (!localSmokeFileExists && sourceImageExists) {
    await copyFileIntoSmokeTests(candidateImageLocation, smokeFilePath);
  }

  const resolvedLocalSmokeFileExists = await fs.access(smokeFilePath).then(() => true).catch(() => false);
  if (!resolvedLocalSmokeFileExists) {
    throw new AppError(`media agent 没有产出可用图片文件。原始返回：${text.slice(0, 500)}`, 502);
  }

  return {
    ok: true,
    provider: 'media-agent',
    model: typeof json.model === 'string' ? json.model : parsed?.result?.meta?.agentMeta?.model || DEFAULT_MEDIA_AGENT_ID,
    prompt,
    imageCount: 1,
    firstImagePreview: smokePublicUrl,
    elapsedMs: Date.now() - startedAt,
    description: typeof json.image_dimensions === 'string' ? `智媒已生成图片（${json.image_dimensions}），Kid Chat 已复制到本地 smoke-tests 目录。` : '智媒已生成图片，Kid Chat 已复制到本地 smoke-tests 目录。',
    debug: {
      rawTextPreview: text.slice(0, 800),
      stdoutPreview: stdout.slice(0, 800),
      stderrPreview: (stderr || '').slice(0, 800),
      sourceImageLocation: candidateImageLocation,
      sourceImageExists,
      localSmokeFilePath: smokeFilePath,
      localSmokeFileExists: resolvedLocalSmokeFileExists,
      resolvedImage: smokePublicUrl,
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
    firstImagePreview: result.images[0] || '',
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
