/**
 * OrbitCI - Main Action Entrypoint
 */

import fs from 'node:fs';
import * as core from '@actions/core';
import { GitHubClient, runGitCommand } from './github.js';
import { handleComment } from './handlers/comment.js';
import { handlePrOpened } from './handlers/prOpened.js';

export async function run() {
  try {
    // 1. Read Action inputs and environment variables
    const geminiApiKey =
      core.getInput('gemini_api_key') || process.env.GEMINI_API_KEY;
    const githubToken =
      core.getInput('github_token') || process.env.GITHUB_TOKEN;
    const githubRepository = process.env.GITHUB_REPOSITORY;
    const githubEventPath = process.env.GITHUB_EVENT_PATH;
    const modelName = core.getInput('model') || 'gemini-3.6-flash';
    const botName = core.getInput('bot_name') || '@orbitci';
    const postAckInput = core.getInput('post_ack') || 'true';
    const postAck = postAckInput.toLowerCase() === 'true' || postAckInput === '1';
    const maxFileSizeKb = parseInt(
      core.getInput('max_file_size_kb') || '50',
      10
    );
    const targetBranchInput = core.getInput('target_branch') || 'auto';

    if (!githubToken || !githubRepository) {
      core.setFailed(
        'Missing GITHUB_TOKEN or GITHUB_REPOSITORY environment variables.'
      );
      return 1;
    }

    if (!githubEventPath || !fs.existsSync(githubEventPath)) {
      core.setFailed(
        `Event payload file not found at GITHUB_EVENT_PATH: ${githubEventPath}`
      );
      return 1;
    }

    const repoOwner = githubRepository.includes('/')
      ? githubRepository.split('/')[0]
      : '';

    // 2. Configure Git safe directory, user identity, and authenticated remote
    try {
      const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
      runGitCommand(['config', '--global', '--add', 'safe.directory', workspace]);
      runGitCommand(['config', '--global', 'user.name', 'OrbitCI[bot]']);
      runGitCommand([
        'config',
        '--global',
        'user.email',
        'orbitci[bot]@users.noreply.github.com',
      ]);
      const remoteUrl = `https://x-access-token:${githubToken}@github.com/${githubRepository}.git`;
      runGitCommand(['remote', 'set-url', 'origin', remoteUrl]);
    } catch (gitConfigErr) {
      core.warning(`Failed to set git config: ${gitConfigErr.message}`);
    }

    // 3. Read and parse GitHub Event JSON
    let eventData;
    try {
      const rawPayload = fs.readFileSync(githubEventPath, 'utf-8');
      eventData = JSON.parse(rawPayload);
    } catch (err) {
      core.setFailed(`Failed to parse GitHub event JSON: ${err.message}`);
      return 1;
    }

    const gh = new GitHubClient(githubToken, githubRepository);
    const action = eventData.action || '';
    const pullRequest = eventData.pull_request;
    const comment = eventData.comment;
    const issue = eventData.issue;

    // Case 1: Pull Request Opened -> Assign Reviewers
    if (pullRequest && action === 'opened') {
      const code = await handlePrOpened(gh, eventData, repoOwner);
      return code;
    }

    // Case 2: Issue Comment on a PR -> Execute AI Assistant
    if (comment && issue) {
      const code = await handleComment(gh, eventData, {
        geminiApiKey,
        modelName,
        botName,
        postAck,
        maxFileSizeKb,
        targetBranchInput,
        repoOwner,
      });
      return code;
    }

    core.info(`Unhandled event action '${action}'. Skipping OrbitCI.`);
    return 0;
  } catch (err) {
    core.setFailed(`OrbitCI failed with error: ${err.message}`);
    return 1;
  }
}

// Execute if run directly
if (process.env.NODE_ENV !== 'test') {
  run();
}
