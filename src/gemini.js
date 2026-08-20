/**
 * AntigravityCI - Google Gemini Cascade Engine
 */

import * as core from '@actions/core';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GEMINI_CASCADE_MODELS } from './config.js';

export const GEMINI_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: {
      type: SchemaType.STRING,
      description: 'A concise 1-2 sentence summary of changes or analysis made.',
    },
    explanation: {
      type: SchemaType.STRING,
      description:
        'Detailed markdown explanation of improvements made, architectural tradeoffs, or findings.',
    },
    risk_level: {
      type: SchemaType.STRING,
      description:
        "Assessment of change risk: 'LOW', 'MEDIUM', or 'HIGH'.",
    },
    breaking_changes: {
      type: SchemaType.BOOLEAN,
      description: 'Whether any proposed changes introduce breaking API changes.',
    },
    pr_title: {
      type: SchemaType.STRING,
      description:
        "Conventional commit style PR title (e.g. 'perf(db): optimize query loop with batching')",
    },
    pr_body: {
      type: SchemaType.STRING,
      description: 'Complete markdown description for the new Pull Request.',
    },
    modified_files: {
      type: SchemaType.ARRAY,
      description:
        'List of files to modify, create, or delete. Empty for read-only commands like explain.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          path: {
            type: SchemaType.STRING,
            description: 'Relative path to the file in the repository',
          },
          action: {
            type: SchemaType.STRING,
            description: "Action to perform: 'modify', 'create', or 'delete'",
          },
          content: {
            type: SchemaType.STRING,
            description:
              'Complete updated file content. Must contain the full file, not just diffs.',
          },
        },
        required: ['path', 'action', 'content'],
      },
    },
  },
  required: [
    'summary',
    'explanation',
    'risk_level',
    'breaking_changes',
    'pr_title',
    'pr_body',
    'modified_files',
  ],
};

/**
 * Call Google Gemini with automatic multi-model fallback cascade.
 *
 * @param {string} apiKey - Google Gemini API Key
 * @param {string} requestedModel - Primary model to use
 * @param {string} prompt - User instruction and context JSON
 * @param {string} systemInstruction - System rules and guidelines
 * @returns {Promise<{ data: any, modelUsed: string }>}
 */
export async function callGeminiCascade(
  apiKey,
  requestedModel,
  prompt,
  systemInstruction
) {
  const genAI = new GoogleGenerativeAI(apiKey);

  const modelsToTry = [
    requestedModel,
    ...GEMINI_CASCADE_MODELS.filter((m) => m !== requestedModel),
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      core.info(`Attempting Gemini generation with model (${modelName})...`);

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      if (text) {
        const cleanJson = text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '');
        const data = JSON.parse(cleanJson);
        return { data, modelUsed: modelName };
      }
    } catch (err) {
      lastError = err;
      core.warning(
        `Gemini model ${modelName} failed: ${err.message}. Cascading to next model...`
      );
    }
  }

  throw new Error(
    `All Gemini cascade models failed: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * AI dispatcher validating keys and calling Gemini cascade.
 *
 * @param {string|null|undefined} apiKey - Google Gemini API Key
 * @param {string} modelName - Model name
 * @param {string} prompt - Prompt content
 * @param {string} systemInstruction - System instruction
 * @returns {Promise<{ data: any, modelUsed: string }>}
 */
export async function callAiEngine(
  apiKey,
  modelName,
  prompt,
  systemInstruction
) {
  if (!apiKey) {
    throw new Error(
      'Missing GEMINI_API_KEY. Please provide your Google Gemini API Key in repository secrets.'
    );
  }

  return await callGeminiCascade(
    apiKey,
    modelName,
    prompt,
    systemInstruction
  );
}
