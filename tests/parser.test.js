import { describe, expect, it } from 'vitest';
import { extractFlags, parseCommentCommand } from '../src/parser.js';

describe('Flags Extraction', () => {
  it('extracts key-value and boolean flags', () => {
    const text = 'optimize async loop --model=gemini-3.7-flash --deep';
    const { cleanText, flags } = extractFlags(text);
    expect(cleanText).toBe('optimize async loop');
    expect(flags.model).toBe('gemini-3.7-flash');
    expect(flags.deep).toBe(true);
  });
});

describe('Comment Command Parsing', () => {
  it('parses basic command with @orbitci', () => {
    const result = parseCommentCommand('@orbitci refactor');
    expect(result).not.toBeNull();
    expect(result.command).toBe('refactor');
    expect(result.instruction).toBe('');
    expect(result.isCommentOnly).toBe(false);
  });

  it('parses basic command with @orbit', () => {
    const result = parseCommentCommand('@orbit perf optimize loop');
    expect(result).not.toBeNull();
    expect(result.command).toBe('perf');
    expect(result.instruction).toBe('optimize loop');
  });

  it('parses backward compatible command with @antigravityci', () => {
    const result = parseCommentCommand('@antigravityci refactor');
    expect(result).not.toBeNull();
    expect(result.command).toBe('refactor');
  });

  it('parses polish-pr command', () => {
    const result = parseCommentCommand('@antigravity polish-pr enhance title and body');
    expect(result.command).toBe('polish-pr');
    expect(result.isPolish).toBe(true);
    expect(result.actionVerb).toContain('Polishing PR');
  });

  it('parses command with flags correctly', () => {
    const result = parseCommentCommand(
      '@antigravity perf optimize db queries --model=gemini-3.7-flash --deep'
    );
    expect(result.command).toBe('perf');
    expect(result.instruction).toBe('optimize db queries');
    expect(result.flags.model).toBe('gemini-3.7-flash');
    expect(result.flags.deep).toBe(true);
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

  it('parses security command and audit alias', () => {
    const res1 = parseCommentCommand('@antigravity security audit sql injection');
    expect(res1.command).toBe('security');
    expect(res1.actionVerb).toContain('Auditing security');

    const res2 = parseCommentCommand('@antigravity audit for secret leaks');
    expect(res2.command).toBe('security');
  });

  it('parses explain command as comment-only mode', () => {
    const result = parseCommentCommand(
      '@antigravity explain architectural tradeoffs'
    );
    expect(result).not.toBeNull();
    expect(result.command).toBe('explain');
    expect(result.isCommentOnly).toBe(true);
    expect(result.actionVerb).toContain('Explaining code');
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
