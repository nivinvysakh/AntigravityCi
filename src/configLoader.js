/**
 * OrbitCI - Project Configuration Loader
 */

import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';

/**
 * @typedef {Object} OrbitConfig
 * @property {string[]} [rules] - Custom project rules or conventions
 * @property {string} [styleGuide] - Preferred coding style or linter rules
 * @property {string} [language] - Primary programming language
 * @property {string[]} [ignorePatterns] - Custom files or patterns to ignore
 */

/**
 * Load optional .orbitci.json, .orbit.json, or .antigravity.json configuration from workspace.
 *
 * @param {string} [workspace=process.cwd()] - Path to repository workspace
 * @returns {OrbitConfig|null} Loaded config or null if not found
 */
export function loadProjectConfig(workspace = process.cwd()) {
  const configFiles = [
    '.orbitci.json',
    '.orbit.json',
    '.antigravity.json',
  ];

  for (const filename of configFiles) {
    const jsonPath = path.join(workspace, filename);
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        core.info(`Loaded custom project rules from ${filename}`);
        return parsed;
      } catch (err) {
        core.warning(`Failed to parse ${filename}: ${err.message}`);
      }
    }
  }

  return null;
}
