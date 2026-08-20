/**
 * OrbitCI - Configuration and Constants
 */

// Security: Allowed GitHub author associations
export const AUTHORIZED_ROLES = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// Safety: File extensions to treat as binary
export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.webp',
  '.bmp',
  '.tiff',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.exe',
  '.bin',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.eot',
  '.ttf',
  '.otf',
  '.pyc',
  '.pyo',
  '.pyd',
  '.class',
  '.jar',
  '.war',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.flv',
  '.wav',
  '.db',
  '.sqlite',
  '.sqlite3',
]);

// Safety: Lockfiles and auto-generated files to ignore
export const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'poetry.lock',
  'pipfile.lock',
  'cargo.lock',
  'go.sum',
  'gemfile.lock',
  'composer.lock',
  'flake.lock',
]);

// Gemini fallback cascade list
export const GEMINI_CASCADE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.0-flash-exp',
];
