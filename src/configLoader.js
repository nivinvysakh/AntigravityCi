/**
 * AntigravityCI - Project Configuration Loader
 */

import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';

/**
 * @typedef {Object} AntigravityConfig
 * @property {string[]} [rules] - Custom project rules or conventions
 * @property {string} [styleGuide] - Preferred coding style or linter rules
 * @property {string} [language] - Primary programming language
 * @property {string[]} [ignorePatterns] - Custom files or patterns to ignore
 */

/**
 * Load optional .antigravity.json or .antigravity.yml configuration from the workspace root.
 *
 * @param {string} [workspace=process.cwd()] - Path to repository workspace
 * @returns {AntigravityConfig|null} Loaded config or null if not found
 */
export function loadProjectConfig(workspace = process.cwd()) {
  const jsonPath = path.join(workspace, '.antigravity.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      core.info('Loaded custom project rules from .antigravity.json');
      return parsed;
    } catch (err) {
      core.warning(`Failed to parse .antigravity.json: ${err.message}`);
    }
  }

  return null;
}
