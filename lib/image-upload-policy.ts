export const IMAGE_UPLOAD_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_WIDTH = 4096;
export const IMAGE_UPLOAD_MAX_HEIGHT = 4096;
export const IMAGE_UPLOAD_MAX_PIXELS = 12_000_000;

export function formatBytesToMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)}MB`;
}

export function getAcceptedImageTypeLabel() {
  return 'PNG、JPG、WEBP、GIF';
}
