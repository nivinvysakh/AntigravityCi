import { describe, expect, it } from 'vitest';
import { parseCommentCommand } from '../src/parser.js';

describe('Comment Command Parsing', () => {
  it('parses basic command without instruction', () => {
    const result = parseCommentCommand('@antigravityci refactor');
    expect(result).not.toBeNull();
    expect(result.command).toBe('refactor');
    expect(result.instruction).toBe('');
  });

  it('parses command with natural language instruction', () => {
    const result = parseCommentCommand(
      '@antigravityci fix handle edge case when token is expired'
    );
    expect(result).not.toBeNull();
    expect(result.command).toBe('fix');
    expect(result.instruction).toBe(
      'handle edge case when token is expired'
    );
  });

  it('parses multiline instructions correctly', () => {
    const body =
      '@antigravityci refactor\nLine 1: optimize loops\nLine 2: add docstrings';
    const result = parseCommentCommand(body);
    expect(result).not.toBeNull();
    expect(result.command).toBe('refactor');
    expect(result.instruction).toContain('Line 1: optimize loops');
    expect(result.instruction).toContain('Line 2: add docstrings');
  });

  it('supports custom bot names', () => {
    const result = parseCommentCommand(
      '@mybot test add unit tests',
      '@mybot'
    );
    expect(result).not.toBeNull();
    expect(result.command).toBe('test');
    expect(result.instruction).toBe('add unit tests');
  });

  it('handles case-insensitivity in commands and bot names', () => {
    const result = parseCommentCommand(
      '@AntiGravityCi REFACTOR optimize loop'
    );
    expect(result).not.toBeNull();
    expect(result.command).toBe('refactor');
    expect(result.instruction).toBe('optimize loop');
  });

  it('supports @antigravity alias without ci suffix', () => {
    const result = parseCommentCommand(
      '@antigravity doc add Google-style docstrings'
    );
    expect(result).not.toBeNull();
    expect(result.command).toBe('doc');
    expect(result.instruction).toBe(
      'add Google-style docstrings'
    );
  });

  it('ignores irrelevant comments', () => {
    const result = parseCommentCommand(
      'Great work on this PR! LGTM.'
    );
    expect(result).toBeNull();
  });

  it('ignores mentions without a command', () => {
    const result = parseCommentCommand('@antigravityci');
    expect(result).toBeNull();
  });

  it('handles null, undefined, or non-string body', () => {
    expect(parseCommentCommand(null)).toBeNull();
    expect(parseCommentCommand(undefined)).toBeNull();
    expect(parseCommentCommand('')).toBeNull();
    expect(parseCommentCommand('   ')).toBeNull();
  });
});
