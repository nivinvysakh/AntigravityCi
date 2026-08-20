/**
 * AntigravityCI - PR Comment Command Parser
 */

/**
 * @typedef {Object} ParsedCommand
 * @property {string} botName - Normalized bot handle found (e.g. '@antigravity' or '@antigravityci')
 * @property {string} rawCommand - Raw command word as typed by user
 * @property {string} command - Normalized canonical command (e.g. 'refactor', 'security', 'explain')
 * @property {string} instruction - Natural language instruction or prompt
 * @property {boolean} isCommentOnly - Whether this command posts analysis directly without opening a PR
 * @property {string} actionVerb - Dynamic action description for acknowledgment
 */

// Command alias normalization map
export const COMMAND_ALIASES = {
  // Refactor & Architecture
  refactor: 'refactor',
  refactoring: 'refactor',
  clean: 'refactor',

  // Bug Fixes
  fix: 'fix',
  bugfix: 'fix',
  hotfix: 'fix',
  patch: 'fix',

  // Testing & Test Suites
  test: 'test',
  tests: 'test',
  unittest: 'test',
  pytest: 'test',

  // Documentation
  doc: 'doc',
  docs: 'doc',
  document: 'doc',
  docstrings: 'doc',

  // Code Review & Auditing
  review: 'review',

  // Security Audit & Hardening
  security: 'security',
  sec: 'security',
  vuln: 'security',
  audit: 'security',

  // Performance & Optimization
  perf: 'perf',
  performance: 'perf',
  optimize: 'perf',
  speed: 'perf',

  // Architectural Explanation & Walkthrough (Comment-Only)
  explain: 'explain',
  walkthrough: 'explain',
  eli5: 'explain',

  // Type Annotations & Type Checking
  types: 'types',
  typecheck: 'types',
  typing: 'types',

  // Changelog & Release Notes
  changelog: 'changelog',
  summarize: 'changelog',
  release_notes: 'changelog',
  'release-notes': 'changelog',
};

// Dynamic action verbs and icons for each command
export const ACTION_VERBS = {
  refactor: 'Refactoring your code ♻️',
  fix: 'Fixing bugs & resolving issues 🐛',
  test: 'Generating comprehensive test suites 🧪',
  doc: 'Writing documentation & docstrings 📝',
  review: 'Auditing code quality & patterns 🔍',
  security: 'Auditing security & hardening code 🛡️',
  perf: 'Optimizing performance & throughput ⚡',
  explain: 'Explaining code & architecture 💡',
  types: 'Adding strict type annotations 🏷️',
  changelog: 'Generating release notes & changelog 📋',
};

/**
 * Parse an issue / PR comment body to extract bot commands and instructions.
 *
 * @param {string} body - The raw comment body
 * @param {string} [botName='@antigravityci'] - The default or configured bot name
 * @returns {ParsedCommand|null} Parsed command object or null if not triggered
 */
export function parseCommentCommand(body, botName = '@antigravityci') {
  if (!body || typeof body !== 'string') {
    return null;
  }

  const cleanBody = body.trim();
  if (!cleanBody) {
    return null;
  }

  // Generate bot aliases: configured botName, @antigravity, and @antigravityci
  const cleanTarget = botName.replace(/^@/, '');
  const handles = new Set([
    cleanTarget.toLowerCase(),
    'antigravity',
    'antigravityci',
  ]);

  const escapedHandles = Array.from(handles)
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Match: @handle <command> [optional instruction / multiline]
  const pattern = new RegExp(
    `^@(?:${escapedHandles})\\s+([a-zA-Z0-9_-]+)(?:\\s+([\\s\\S]+))?$`,
    'im'
  );

  const match = cleanBody.match(pattern);
  if (!match) {
    return null;
  }

  const matchedBot = cleanBody.match(new RegExp(`@(?:${escapedHandles})`, 'i'));
  const foundHandle = matchedBot ? matchedBot[0] : botName;
  const rawCommand = match[1].toLowerCase();
  const normalizedCommand = COMMAND_ALIASES[rawCommand] || rawCommand;
  const instruction = (match[2] || '').trim();
  const isCommentOnly = normalizedCommand === 'explain';
  const actionVerb = ACTION_VERBS[normalizedCommand] || `Processing \`${rawCommand}\` 🤖`;

  return {
    botName: foundHandle,
    rawCommand,
    command: normalizedCommand,
    instruction,
    isCommentOnly,
    actionVerb,
  };
}
