import { readImageGenerationRuntimeConfig } from './image-generation';
import { IMAGE_UPLOAD_ACCEPTED_TYPES, IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_HEIGHT, IMAGE_UPLOAD_MAX_PIXELS, IMAGE_UPLOAD_MAX_WIDTH } from './image-upload-policy';
import { IMAGE_UPLOAD_MIN_INTERVAL_MS } from './image-upload-throttle';

export type ImageGenerationRuntimeCheck = {
  provider: string;
  model: string;
  hasGeminiApiKey: boolean;
  hasGeminiImageModel: boolean;
  uploadMaxBytes: number;
  uploadMaxWidth: number;
  uploadMaxHeight: number;
  uploadMaxPixels: number;
  uploadMinIntervalMs: number;
  acceptedMimeTypes: string[];
  issues: string[];
};

export async function getImageGenerationRuntimeCheck(): Promise<ImageGenerationRuntimeCheck> {
  const config = await readImageGenerationRuntimeConfig();
  const issues: string[] = [];

  if (config.provider === 'gemini-direct' && !config.hasGeminiApiKey) {
    issues.push('Gemini 直连已启用，但没有检测到 Gemini API key。');
  }

  if (config.provider === 'gemini-direct' && !config.hasGeminiImageModel) {
    issues.push('Gemini 直连已启用，但没有配置 KID_CHAT_IMAGE_MODEL。');
  }

  if (config.provider === 'inference-sh') {
    issues.push('当前生图后端是 inference.sh；如果你想走 media agent 或 Gemini 直连，请调整 KID_CHAT_IMAGE_PROVIDER。');
  }

  if (config.provider === 'media-agent' && !config.hasGeminiApiKey) {
    issues.push('当前主路径是 media agent；如果需要 Gemini direct 兜底，请补上 Gemini API key。');
  }

  if (config.provider === 'media-agent' && !config.hasGeminiImageModel) {
    issues.push('当前主路径是 media agent；如果需要 Gemini direct 兜底，请配置 KID_CHAT_IMAGE_MODEL。');
  }

  return {
    provider: config.provider,
    model: config.model,
    hasGeminiApiKey: config.hasGeminiApiKey,
    hasGeminiImageModel: config.hasGeminiImageModel,
    uploadMaxBytes: IMAGE_UPLOAD_MAX_BYTES,
    uploadMaxWidth: IMAGE_UPLOAD_MAX_WIDTH,
    uploadMaxHeight: IMAGE_UPLOAD_MAX_HEIGHT,
    uploadMaxPixels: IMAGE_UPLOAD_MAX_PIXELS,
    uploadMinIntervalMs: IMAGE_UPLOAD_MIN_INTERVAL_MS,
    acceptedMimeTypes: [...IMAGE_UPLOAD_ACCEPTED_TYPES],
    issues,
  };
}
