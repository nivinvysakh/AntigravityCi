/**
 * AntigravityCI - PR Comment Command Parser
 */

/**
 * @typedef {Object} ParsedCommand
 * @property {string} botName - Normalized bot handle found (e.g. '@antigravity' or '@antigravityci')
 * @property {string} command - Extracted action command (e.g. 'refactor', 'fix', 'test', 'doc')
 * @property {string} instruction - Natural language instruction or prompt
 */

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
  const command = match[1].toLowerCase();
  const instruction = (match[2] || '').trim();

  return {
    botName: foundHandle,
    command,
    instruction,
  };
}
