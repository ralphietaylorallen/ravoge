import "server-only";

import sharp from "sharp";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_COUNT = 5;
export const MAX_IMAGE_BYTES = 1_000_000;
export const MAX_TOTAL_IMAGE_BYTES = 5_000_000;
export const MAX_IMAGE_EDGE = 1600;

export type PreparedEquipmentImage = {
  dataUrl: string;
  height: number;
  size: number;
  width: number;
};

export async function prepareEquipmentImage(file: File): Promise<PreparedEquipmentImage> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use JPEG, PNG, or WebP photos.");
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Each processed photo must be 1 MB or smaller.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let pipeline = sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format ?? "")) {
    throw new Error("One photo is corrupt or unsupported.");
  }

  pipeline = pipeline.resize({
    fit: "inside",
    height: MAX_IMAGE_EDGE,
    width: MAX_IMAGE_EDGE,
    withoutEnlargement: true,
  });

  let output = await pipeline.jpeg({ chromaSubsampling: "4:2:0", mozjpeg: true, quality: 82 }).toBuffer({ resolveWithObject: true });
  if (output.data.length > MAX_IMAGE_BYTES) {
    output = await sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ fit: "inside", height: MAX_IMAGE_EDGE, width: MAX_IMAGE_EDGE, withoutEnlargement: true })
      .jpeg({ chromaSubsampling: "4:2:0", mozjpeg: true, quality: 66 })
      .toBuffer({ resolveWithObject: true });
  }
  if (output.data.length > MAX_IMAGE_BYTES) throw new Error("One photo could not be compressed below 1 MB.");

  return {
    dataUrl: `data:image/jpeg;base64,${output.data.toString("base64")}`,
    height: output.info.height,
    size: output.data.length,
    width: output.info.width,
  };
}

export function validateImageFileSet(files: File[]) {
  if (files.length < 1 || files.length > MAX_IMAGE_COUNT) {
    throw new Error("Choose between 1 and 5 photos.");
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_IMAGE_BYTES) {
    throw new Error("The processed photos must total 5 MB or less.");
  }
}
