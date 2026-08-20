import { describe, expect, it, vi } from 'vitest';
import { callAiEngine, callGeminiCascade } from '../src/gemini.js';

describe('Gemini AI Engine', () => {
  it('throws error when GEMINI_API_KEY is missing', async () => {
    await expect(
      callAiEngine(null, 'gemini-3.6-flash', 'prompt', 'system')
    ).rejects.toThrow('Missing GEMINI_API_KEY');

    await expect(
      callAiEngine('', 'gemini-3.6-flash', 'prompt', 'system')
    ).rejects.toThrow('Missing GEMINI_API_KEY');
  });

  it('correctly parses structured JSON response from Gemini model', async () => {
const { mockData } = vi.hoisted(() => {
  return {
    mockData: {
      summary: 'Refactored async loops',
      explanation: 'Replaced for-loops with Promise.all',
      risk_level: 'LOW',
      breaking_changes: false,
      pr_title: 'refactor(async): use Promise.all',
      pr_body: 'Optimized async operations',
      modified_files: [
        {
          path: 'src/index.js',
          action: 'modify',
          content: 'console.log("hello");',
        },
      ],
    },
  };
});

vi.mock('@google/generative-ai', () => {
  return {
    SchemaType: {
      OBJECT: 'object',
      STRING: 'string',
      ARRAY: 'array',
    },
    GoogleGenerativeAI: class {
      constructor() {}
      getGenerativeModel() {
        return {
          generateContent: async () => ({
            response: {
              text: () => JSON.stringify(mockData),
            },
          }),
        };
      }
    },
  };
});

    const result = await callGeminiCascade(
      'fake-key',
      'gemini-3.6-flash',
      'test prompt',
      'system instruction'
    );

    expect(result.data.summary).toBe('Refactored async loops');
    expect(result.data.modified_files).toHaveLength(1);
    expect(result.modelUsed).toBe('gemini-3.6-flash');
  });
});
