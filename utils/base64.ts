// Simple UTF-8 safe base64 helpers (client + server)
export function encodeBase64(str: string): string {
  try { return btoa(unescape(encodeURIComponent(str))); } catch { return ""; }
}
export function decodeBase64(b64: string): string {
  try { return decodeURIComponent(escape(atob(b64))); } catch { return ""; }
}
