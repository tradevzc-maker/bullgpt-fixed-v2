export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
export function validateImage(file: File): string | null {
  if (!file || file.size === 0) return "Choose a non-empty chart image.";
  if (!allowed.has(file.type)) return "Upload a PNG, JPG, JPEG, or WEBP chart image.";
  if (file.size > MAX_IMAGE_BYTES) return "Your chart is over the 8 MB limit. Please use a smaller image.";
  return null;
}
