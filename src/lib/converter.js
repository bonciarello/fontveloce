/**
 * TTF → WOFF2 converter using fonteditor-core (client-side).
 * Uses Google's woff2 library compiled to WASM.
 */
import { woff2, ttftowoff2 } from 'fonteditor-core';

let initPromise = null;

/**
 * Initialize the WOFF2 WASM module. Safe to call multiple times.
 * @returns {Promise<void>}
 */
export async function initWoff2() {
  if (woff2.isInited()) return;
  if (!initPromise) {
    initPromise = woff2.init('./woff2.wasm');
  }
  return initPromise;
}

/**
 * Convert a TTF ArrayBuffer to WOFF2 ArrayBuffer.
 * @param {ArrayBuffer} ttfBuffer - the TTF file content
 * @returns {ArrayBuffer} - the WOFF2 file content
 */
export function convertTtfToWoff2(ttfBuffer) {
  if (!woff2.isInited()) {
    throw new Error('WOFF2 module not initialized. Call initWoff2() first.');
  }
  return ttftowoff2(ttfBuffer);
}

/**
 * Read a File object and return its ArrayBuffer.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Impossibile leggere il file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extract font family name from a TTF buffer using basic SFNT parsing.
 * Falls back to filename if parsing fails.
 * @param {ArrayBuffer} buffer
 * @param {string} fallbackName
 * @returns {string}
 */
export function extractFontName(buffer, fallbackName) {
  try {
    const view = new DataView(buffer);
    const format = view.getUint16(0, false);
    if (format !== 0x0001 && format !== 0x4F54) {
      return fallbackName;
    }
    const numTables = view.getUint16(4, false);
    for (let i = 0; i < numTables; i++) {
      const offset = 12 + i * 16;
      const tag = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      if (tag === 'name') {
        const tableOffset = view.getUint32(offset + 8, false);
        const nameOffset = 12 + numTables * 16 + tableOffset;
        const formatSelector = view.getUint16(nameOffset, false);
        const count = view.getUint16(nameOffset + 2, false);
        const stringOffset = view.getUint16(nameOffset + 4, false);
        const storageStart = nameOffset + stringOffset;

        // Look for Font Family (nameID 1)
        for (let j = 0; j < count; j++) {
          const recordOffset = nameOffset + 6 + j * 12;
          const platformID = view.getUint16(recordOffset, false);
          const encodingID = view.getUint16(recordOffset + 2, false);
          const nameID = view.getUint16(recordOffset + 6, false);
          const length = view.getUint16(recordOffset + 8, false);
          const strOffset = view.getUint16(recordOffset + 10, false);

          if (nameID === 1) {
            const bytes = new Uint8Array(buffer, storageStart + strOffset, length);
            // Platform 3 (Windows) uses UTF-16BE
            if (platformID === 3) {
              const chars = [];
              for (let k = 0; k < length - 1; k += 2) {
                const code = (bytes[k] << 8) | bytes[k + 1];
                if (code > 0) chars.push(String.fromCharCode(code));
              }
              return chars.join('').trim() || fallbackName;
            }
            // Platform 1 (Mac) uses MacRoman
            if (platformID === 1) {
              return String.fromCharCode.apply(null, Array.from(bytes).filter(b => b > 0)).trim() || fallbackName;
            }
          }
        }
      }
    }
  } catch {
    // Silently fall back
  }
  return fallbackName;
}

/**
 * Format bytes to human-readable size.
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
