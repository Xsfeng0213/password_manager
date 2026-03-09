import { arrayBufferToBase64, base64ToArrayBuffer } from "./utils";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SALT_STORAGE_KEY = "pm_salt";

function getOrCreateSalt(): BufferSource {
  const existing = localStorage.getItem(SALT_STORAGE_KEY);
  if (existing) {
    return new Uint8Array(base64ToArrayBuffer(existing));
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_STORAGE_KEY, arrayBufferToBase64(salt.buffer));
  return salt;
}

export async function deriveKey(masterPassword: string): Promise<CryptoKey> {
  const salt = getOrCreateSalt();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(
  key: CryptoKey,
  value: unknown,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

export async function decryptJson<T>(
  key: CryptoKey,
  ciphertextBase64: string,
  ivBase64: string,
): Promise<T> {
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  const json = decoder.decode(decrypted);
  return JSON.parse(json) as T;
}
