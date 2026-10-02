/** Browser-side preparation for photos shared in the Ahoier community. */
export const SOCIAL_MEDIA_BUCKET = "ahoier-media";
export const MAX_SOCIAL_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1600;
const SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareSocialImage(source: File): Promise<File> {
  if (!SOURCE_TYPES.has(source.type)) throw new Error("Bitte wähle ein JPEG-, PNG- oder WebP-Bild.");
  if (source.size > MAX_SOURCE_BYTES) throw new Error("Das Originalbild darf höchstens 12 MB groß sein.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error("Das Bild konnte nicht geöffnet werden.");
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("Das Bild ist leer.");
    let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
    let quality = 0.84;
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Die Bildverarbeitung ist nicht verfügbar.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") throw new Error("WebP wird von diesem Browser nicht unterstützt.");
      if (blob.size <= MAX_SOCIAL_IMAGE_BYTES) {
        // Canvas encoding re-creates pixels without the source file's EXIF metadata.
        return new File([blob], "ahoier-photo.webp", { type: "image/webp" });
      }
      quality = Math.max(0.5, quality - 0.08);
      edge = Math.max(640, Math.round(edge * 0.82));
    }
    throw new Error("Das Bild ist nach dem Verkleinern noch zu groß.");
  } finally {
    bitmap.close();
  }
}
