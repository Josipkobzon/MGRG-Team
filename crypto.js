// ═══════════════════════════════════════════════════════════════════
// crypto.js — Plan-Dateien mit PIN/Passwort verschlüsseln
// AES-GCM 256 bit, Schlüssel per PBKDF2-SHA256 (310 000 Iterationen).
// Nur Web Crypto API (im Browser eingebaut) — keine externen Bibliotheken.
// ═══════════════════════════════════════════════════════════════════
import { FILE_FORMAT, FILE_VERSION } from "./core.js";

const ITER = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function deriveKey(pin, salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(String(pin).normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export const isEncrypted = (obj) => !!(obj && obj.format === FILE_FORMAT && obj.enc && obj.data);
export const cryptoAvailable = () => !!(globalThis.crypto && crypto.subtle);

/** @param meta nicht-sensible Vorschau (z. B. Mitarbeitername, Zeitraum) */
export async function encryptPlan(plan, pin, meta = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(plan)));
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    enc: { alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), iv: b64(iv) },
    meta,
    data: b64(ct),
  };
}

export async function decryptPlan(file, pin) {
  const key = await deriveKey(pin, unb64(file.enc.salt), file.enc.iter || ITER);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(file.enc.iv) }, key, unb64(file.data));
    return JSON.parse(dec.decode(pt));
  } catch (e) {
    const err = new Error("Falsche PIN");
    err.code = "BAD_PIN";
    throw err;
  }
}
