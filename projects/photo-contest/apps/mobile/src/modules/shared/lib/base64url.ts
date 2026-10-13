const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 패딩 없는 base64url (RFC 4648 §5). React Native에는 Buffer·btoa가 항상 있지 않아 직접 구현한다. */
export function encodeBase64Url(bytes: Uint8Array) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const triple = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    output += ALPHABET.charAt((triple >> 18) & 63) + ALPHABET.charAt((triple >> 12) & 63);
    if (remaining > 1) output += ALPHABET.charAt((triple >> 6) & 63);
    if (remaining > 2) output += ALPHABET.charAt(triple & 63);
  }
  return output;
}
