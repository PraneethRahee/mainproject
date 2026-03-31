export function abToB64(ab) {
  const bytes = new Uint8Array(ab)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function b64ToAb(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function utf8ToAb(str) {
  return new TextEncoder().encode(String(str)).buffer
}

export function abToUtf8(ab) {
  return new TextDecoder().decode(new Uint8Array(ab))
}

