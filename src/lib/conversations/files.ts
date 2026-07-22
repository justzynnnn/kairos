export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);
function begins(bytes: Uint8Array, values: number[]) {
  return values.every((value, index) => bytes[index] === value);
}
export function validAttachmentBytes(mimeType: string, bytes: Uint8Array) {
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > MAX_ATTACHMENT_BYTES ||
    !ALLOWED_ATTACHMENT_TYPES.has(mimeType)
  )
    return false;
  if (mimeType === "application/pdf")
    return begins(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mimeType === "image/png")
    return begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/jpeg") return begins(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/webp")
    return (
      begins(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}
