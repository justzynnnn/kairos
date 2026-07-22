const supportedAudioTypes = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/webm",
  "audio/wav",
  "audio/x-m4a",
  "audio/ogg",
]);

export function normalizeAudioMimeType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}
export function isSupportedAudioMimeType(value: string) {
  return (
    value.length === 0 || supportedAudioTypes.has(normalizeAudioMimeType(value))
  );
}
