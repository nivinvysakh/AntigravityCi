/**
 * OrbitCI - Safety & Context Filtering
 */

import fs from 'node:fs';
import path from 'node:path';
import { BINARY_EXTENSIONS, LOCKFILES } from './config.js';

/**
 * Determine if a file is safe to include in AI analysis context.
 *
 * @param {string} filePath - File path or filename
 * @param {number} [sizeBytes=0] - File size in bytes
 * @param {number} [maxSizeKb=50] - Maximum allowed file size in KB
 * @returns {{ safe: boolean, reason: string }}
 */
export function isSafeTextFile(filePath, sizeBytes = 0, maxSizeKb = 50) {
  if (!filePath || typeof filePath !== 'string') {
    return { safe: false, reason: 'Invalid file path' };
  }

  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // 1. Protect GitHub Actions workflow files (GITHUB_TOKEN cannot push changes to workflows without PAT)
  if (normalizedPath.startsWith('.github/workflows/')) {
    return { safe: false, reason: 'Protected workflow file (.github/workflows/*)' };
  }

  // 2. Filter out lockfiles and dependency trees
  if (LOCKFILES.has(basename)) {
    return { safe: false, reason: `Ignored lockfile: ${basename}` };
  }

  // 2. Filter out binary assets and media files
  if (BINARY_EXTENSIONS.has(ext)) {
    return { safe: false, reason: `Ignored binary file extension: ${ext}` };
  }

  // 3. Filter out oversized files
  const maxBytes = maxSizeKb * 1024;
  if (sizeBytes > maxBytes) {
    return {
      safe: false,
      reason: `File size (${Math.round(sizeBytes / 1024)}KB) exceeds limit (${maxSizeKb}KB)`,
    };
  }

  return { safe: true, reason: 'OK' };
}

/**
 * Safely read a text file from disk with size and existence guards.
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @param {number} [maxSizeKb=50] - Maximum allowed size in KB
 * @returns {string|null} File content as string, or null if unreadable / oversized
 */
export function readFileSafely(filePath, maxSizeKb = 50) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }

    const check = isSafeTextFile(filePath, stat.size, maxSizeKb);
    if (!check.safe) {
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
