import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSafeTextFile, readFileSafely } from '../src/filters.js';

describe('Safety Context Filters', () => {
  const lockfiles = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'poetry.lock',
    'Pipfile.lock',
    'Cargo.lock',
    'go.sum',
    'Gemfile.lock',
    'composer.lock',
    'flake.lock',
  ];

  it.each(lockfiles)('ignores lockfile %s', (file) => {
    const check = isSafeTextFile(file, 100, 50);
    expect(check.safe).toBe(false);
    expect(check.reason).toContain('Ignored lockfile');
  });

  const binaryFiles = [
    'logo.png',
    'avatar.jpg',
    'banner.jpeg',
    'icon.ico',
    'diagram.pdf',
    'bundle.zip',
    'archive.tar.gz',
    'binary.exe',
    'lib.so',
    'font.woff2',
    'cache.pyc',
    'database.sqlite3',
  ];

  it.each(binaryFiles)('ignores binary file %s', (file) => {
    const check = isSafeTextFile(file, 100, 50);
    expect(check.safe).toBe(false);
    expect(check.reason).toContain('Ignored binary file extension');
  });

  it('rejects oversized files', () => {
    const check = isSafeTextFile('large_file.ts', 60 * 1024, 50);
    expect(check.safe).toBe(false);
    expect(check.reason).toContain('exceeds limit');
  });

  const validCodeFiles = [
    'src/index.ts',
    'app/main.py',
    'internal/server.go',
    'components/Button.jsx',
    'README.md',
    'config.yaml',
  ];

  it.each(validCodeFiles)('allows valid code file %s', (file) => {
    const check = isSafeTextFile(file, 10 * 1024, 50);
    expect(check.safe).toBe(true);
    expect(check.reason).toBe('OK');
  });
});

describe('Safe File Reader', () => {
  it('reads existing valid text file', () => {
    const content = readFileSafely('package.json', 50);
    expect(content).not.toBeNull();
    expect(content).toContain('orbitci');
  });

  it('returns null for nonexistent file', () => {
    const content = readFileSafely('nonexistent-file.xyz', 50);
    expect(content).toBeNull();
  });
});
