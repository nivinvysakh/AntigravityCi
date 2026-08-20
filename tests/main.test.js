import * as core from '@actions/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/index.js';

describe('End-to-End Action Execution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.spyOn(core, 'setFailed').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('fails gracefully when GITHUB_TOKEN or GITHUB_REPOSITORY is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;

    const exitCode = await run();
    expect(exitCode).toBe(1);
  });

  it('fails gracefully when event payload file is not found', async () => {
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_EVENT_PATH = '/path/does/not/exist.json';

    const exitCode = await run();
    expect(exitCode).toBe(1);
  });
});
