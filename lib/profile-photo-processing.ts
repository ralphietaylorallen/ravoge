import "server-only";
import sharp from "sharp";

export async function readProfilePhotoForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Choose a photo first.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 5_400_000) { await reader.cancel(); throw new Error('The prepared photo must be 5 MB or smaller.'); }
    chunks.push(new Uint8Array(value));
  }
  return new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

export async function optimizeProfilePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo. HEIC/HEIF is converted on your device first.');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('The prepared photo must be 5 MB or smaller. Choose a smaller photo and retry.');
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new Error('unsupported');
    const profile = await image.rotate().resize(1024, 1024, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const thumbnail = await sharp(profile).resize(160, 160, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { profile, thumbnail };
  } catch {
    throw new Error('This photo could not be decoded safely. Choose another JPEG, PNG, WebP, HEIC or HEIF photo. Your previous photo is unchanged.');
  }
}
