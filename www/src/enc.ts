import { randomBytes } from "tweetnacl";
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from "tweetnacl-util";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";

export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
) {
  const sharedSecret = await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    privateKey,
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("Salt"),
      info: new Uint8Array([]),
    },
    false,
    ["deriveKey", "deriveBits"],
  );

  const derivedKey = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("Salt"),
      info: new Uint8Array([]),
    },
    sharedSecret,
    256,
  );

  return new Uint8Array(derivedKey);
}

export async function encryptMessage(message: string, key: Uint8Array) {
  const nonce = randomBytes(12);
  const messageData = decodeUTF8(message);
  const encryptedData = new ChaCha20Poly1305(key).seal(nonce, messageData);
  const combined = new Uint8Array(nonce.length + encryptedData.length);
  combined.set(nonce);
  combined.set(encryptedData, nonce.length);

  return encodeBase64(combined);
}

export async function decryptMessage(
  encryptedMessage: string,
  key: Uint8Array,
) {
  const combined = decodeBase64(encryptedMessage);
  const nonce = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const decryptedData = new ChaCha20Poly1305(key).open(nonce, encryptedData);
  if (!decryptedData) {
    return "Error decoding";
  }

  return encodeUTF8(decryptedData);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let binaryString = atob(base64);
  if (binaryString.length === 64) {
    binaryString = String.fromCharCode(0x04) + binaryString;
  }
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
