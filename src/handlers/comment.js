/**
 * AntigravityCI - PR Comment Event Handler
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { AUTHORIZED_ROLES } from '../config.js';
import { isSafeTextFile, readFileSafely } from '../filters.js';
import { callAiEngine } from '../gemini.js';
import { runGitCommand } from '../github.js';
import { parseCommentCommand } from '../parser.js';

/**
 * Handle issue_comment event on a Pull Request.
 *
 * @param {import('../github.js').GitHubClient} gh
 * @param {any} eventData
 * @param {Object} options
 * @param {string} [options.geminiApiKey]
 * @param {string} [options.modelName='gemini-2.5-flash']
 * @param {string} [options.botName='@antigravityci']
 * @param {boolean} [options.postAck=true]
 * @param {number} [options.maxFileSizeKb=50]
 * @param {string} [options.targetBranchInput='auto']
 * @param {string} [options.repoOwner='']
 * @returns {Promise<number>}
 */
export async function handleComment(gh, eventData, options) {
  const {
    geminiApiKey,
    modelName = 'gemini-3.6-flash',
    botName = '@antigravityci',
    postAck = true,
    maxFileSizeKb = 50,
    targetBranchInput = 'auto',
    repoOwner = '',
  } = options;

  const comment = eventData.comment;
  const issue = eventData.issue;

  if (!comment || !issue) {
    core.info('Missing comment or issue payload. Skipping.');
    return 0;
  }

  if (!issue.pull_request) {
    core.info('Comment is on an Issue, not a Pull Request. Skipping AntigravityCI.');
    return 0;
  }

  const prNumber = issue.number;
  const commentId = comment.id;
  const commentBody = comment.body || '';
  const authorAssociation = comment.author_association || 'NONE';
  const commentAuthor = comment.user?.login || 'unknown';
  const commentAuthorType = comment.user?.type || '';
  const commentHtmlUrl = comment.html_url || '';

  // 1. Ignore bot-authored comments to prevent infinite loops
  if (
    commentAuthorType === 'Bot' ||
    commentAuthor.endsWith('[bot]') ||
    commentAuthor.toLowerCase() === 'antigravityci'
  ) {
    core.info(`Comment author '${commentAuthor}' is a bot. Ignoring to prevent loop.`);
    return 0;
  }

  // 2. Security Check: Author role authorization
  if (!AUTHORIZED_ROLES.has(authorAssociation)) {
    core.warning(
      `Security: User '${commentAuthor}' has role '${authorAssociation}'. Only ${Array.from(
        AUTHORIZED_ROLES
      ).join(', ')} can trigger AntigravityCI. Ignoring.`
    );
    return 0;
  }

  // 3. Parse command from comment
  const parsed = parseCommentCommand(commentBody, botName);
  if (!parsed) {
    core.info(`Comment does not contain a command for ${botName}. Skipping.`);
    return 0;
  }

  core.info(
    `Triggered by @${commentAuthor} (${authorAssociation}) on PR #${prNumber}: command='${parsed.command}', instruction='${parsed.instruction}'`
  );

  // 4. Acknowledge with thumbs-up reaction and optional replay comment
  await gh.addCommentReaction(commentId, '+1');

  if (postAck) {
    const actionVerb =
      parsed.command === 'refactor' || parsed.command === 'refactoring'
        ? 'Refactoring your code'
        : `Processing \`${parsed.command}\``;

    const replayText = `@${botName.replace(/^@/, '')} ${parsed.command} ${parsed.instruction}`.trim();
    const ackMessage =
      `🤖 **AntigravityCI**: ${actionVerb} for @${commentAuthor}!\n\n` +
      `> 💬 **Instruction Replay:** \`${replayText}\`\n\n` +
      `⏳ Analyzing PR #${prNumber} modified files with Google Gemini (${modelName}). I'll create a branch and open a new PR shortly...`;

    await gh.createIssueComment(prNumber, ackMessage);
  }

  // 5. Fetch PR details and modified files
  let prInfo;
  let prFilesRaw;
  try {
    prInfo = await gh.getPullRequest(prNumber);
    prFilesRaw = await gh.getPrFiles(prNumber);
  } catch (err) {
    core.error(`Failed to fetch PR #${prNumber} metadata: ${err.message}`);
    await gh.createIssueComment(
      prNumber,
      `⚠️ **AntigravityCI Error**: Unable to fetch PR #${prNumber} metadata or files.\n\`\`\`\n${err.message}\n\`\`\``
    );
    return 1;
  }

  const baseBranch = prInfo.base?.ref || 'main';
  const headBranch = prInfo.head?.ref || 'head';
  const headSha = prInfo.head?.sha || '';
  const prTitle = prInfo.title || `PR #${prNumber}`;
  const prAuthor = prInfo.user?.login || 'unknown';
  const targetBranch = targetBranchInput === 'auto' ? baseBranch : targetBranchInput;

  // Checkout PR branch so workspace has latest files locally
  try {
    runGitCommand(['fetch', 'origin', `pull/${prNumber}/head:pr-${prNumber}`]);
    runGitCommand(['checkout', `pr-${prNumber}`]);
    core.info(`Checked out PR #${prNumber} branch locally.`);
  } catch (gitErr) {
    core.warning(`Could not checkout PR branch locally: ${gitErr.message}. Falling back to GitHub API.`);
  }

  // 6. Filter files and collect context
  const filesContext = [];
  const ignoredFilesLog = [];

  for (const fMeta of prFilesRaw) {
    const filename = fMeta.filename;
    const status = fMeta.status;

    if (status === 'removed') {
      continue;
    }

    const safeCheck = isSafeTextFile(filename, 0, maxFileSizeKb);
    if (!safeCheck.safe) {
      ignoredFilesLog.append?.(filename) || ignoredFilesLog.push(`\`${filename}\` (${safeCheck.reason})`);
      continue;
    }

    let content = readFileSafely(filename, maxFileSizeKb);
    if (content === null) {
      content = await gh.getFileContent(filename, headSha);
    }

    if (content !== null) {
      filesContext.push({
        path: filename,
        status,
        patch: fMeta.patch || '',
        content,
      });
    }
  }

  if (filesContext.length === 0) {
    let msg = `ℹ️ **AntigravityCI**: No suitable text files found to process in PR #${prNumber} (all files were binary, lockfiles, deleted, or >${maxFileSizeKb}KB).`;
    if (ignoredFilesLog.length > 0) {
      msg += '\n\n**Ignored Files:**\n- ' + ignoredFilesLog.join('\n- ');
    }
    await gh.createIssueComment(prNumber, msg);
    return 0;
  }

  // 7. Construct prompt for AI Engine
  const systemInstruction =
    'You are AntigravityCI, an expert AI software engineer and code reviewer. ' +
    "Your task is to fulfill the user's PR command by analyzing the provided files, diffs, " +
    'and instructions, and producing high quality, production-grade updated files.\n' +
    'Rules:\n' +
    '1. Return complete file content for each modified file in `modified_files`.\n' +
    "2. Do not truncate code with comments like '// rest of code stays same'. Always return full working files.\n" +
    "3. Follow the repo's existing coding style, naming conventions, and patterns.\n" +
    '4. Provide a clear, conventional commit PR title and detailed PR body.';

  const promptPayload = {
    command: parsed.command,
    instruction: parsed.instruction,
    pr_info: {
      number: prNumber,
      title: prTitle,
      author: prAuthor,
      base_branch: baseBranch,
      head_branch: headBranch,
    },
    files: filesContext,
  };

  const userPrompt =
    `User Command: ${parsed.command}\n` +
    `User Instruction: ${parsed.instruction || 'Apply best practices and appropriate fixes/improvements.'}\n\n` +
    `Context JSON:\n${JSON.stringify(promptPayload, null, 2)}`;

  // 8. Call AI Engine (Google Gemini with Fallback Cascade)
  let aiResponse;
  let engineUsed;
  try {
    const result = await callAiEngine(
      geminiApiKey,
      modelName,
      userPrompt,
      systemInstruction
    );
    aiResponse = result.data;
    engineUsed = result.modelUsed;
    core.info(`AI response generated successfully using: ${engineUsed}`);
  } catch (err) {
    core.error(`AI generation failed: ${err.message}`);
    await gh.createIssueComment(
      prNumber,
      `❌ **AntigravityCI Error**: AI generation failed.\n\`\`\`\n${err.message}\n\`\`\``
    );
    return 1;
  }

  if (!aiResponse.modified_files || aiResponse.modified_files.length === 0) {
    await gh.createIssueComment(
      prNumber,
      `ℹ️ **AntigravityCI**: Analyzed PR #${prNumber} but determined no file modifications were necessary.\n\n` +
        `**Explanation:**\n${aiResponse.explanation}`
    );
    return 0;
  }

  // 9. Create dedicated Git branch and commit changes
  const shortId = crypto.randomBytes(3).toString('hex');
  const cleanCmd = parsed.command.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const newBranchName = `antigravityci/${cleanCmd}-pr${prNumber}-${shortId}`;

  try {
    runGitCommand(['checkout', '-b', newBranchName]);
    core.info(`Created new branch: ${newBranchName}`);

    const changedPaths = [];
    for (const mod of aiResponse.modified_files) {
      const relPath = mod.path;
      const action = (mod.action || 'modify').toLowerCase();
      const content = mod.content || '';

      if (action === 'delete') {
        if (fs.existsSync(relPath)) {
          fs.unlinkSync(relPath);
          runGitCommand(['rm', relPath]);
          changedPaths.push(relPath);
        }
      } else {
        const dir = path.dirname(relPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(relPath, content, 'utf-8');
        runGitCommand(['add', relPath]);
        changedPaths.push(relPath);
      }
    }

    const commitMsg = `${aiResponse.pr_title}\n\n${aiResponse.summary}\n\nRef: PR #${prNumber} by @${commentAuthor}`;
    runGitCommand(['commit', '-m', commitMsg]);
    runGitCommand(['push', '-u', 'origin', newBranchName]);
    core.info(`Pushed branch ${newBranchName} to origin.`);

    // 10. Open a new Pull Request
    const repoSlug = gh.repository;
    const formattedBody =
      `## 🤖 AntigravityCI: \`${parsed.command}\`\n\n` +
      `Triggered by @${commentAuthor} on original PR #${prNumber} ([comment](${commentHtmlUrl})):\n` +
      `> \`${parsed.botName} ${parsed.command} ${parsed.instruction}\`\n\n` +
      `### 📋 Summary\n${aiResponse.summary}\n\n` +
      `### 🔍 Detailed Explanation\n${aiResponse.explanation}\n\n` +
      `### 📁 Modified Files (${changedPaths.length})\n` +
      changedPaths.map((p) => `- \`${p}\``).join('\n') +
      `\n\n---\n*Generated with 🧠 [${engineUsed}](https://github.com/${repoSlug}) via [AntigravityCI](https://github.com/nivinvysakh/AntigravityCi).*`;

    const newPr = await gh.createPullRequest({
      title: aiResponse.pr_title || `[antigravityci] ${parsed.command} on PR #${prNumber}`,
      body: formattedBody,
      head: newBranchName,
      base: targetBranch,
    });

    const newPrUrl = newPr.html_url;
    const newPrNumber = newPr.number;
    core.info(`Created new PR #${newPrNumber} at ${newPrUrl}`);

    // Request review & assign repo owner + original comment author
    const reviewers = new Set();
    if (repoOwner && repoOwner.toLowerCase() !== 'antigravityci') {
      reviewers.add(repoOwner);
    }
    if (commentAuthor && commentAuthor.toLowerCase() !== 'antigravityci') {
      reviewers.add(commentAuthor);
    }

    const reviewersList = Array.from(reviewers);
    if (reviewersList.length > 0) {
      await gh.requestReviewers(newPrNumber, reviewersList);
      await gh.addAssignees(newPrNumber, reviewersList);
    }

    // Post final confirmation comment to original PR thread
    const commentMsg =
      `🚀 **AntigravityCI**: Successfully processed \`${parsed.command}\`!\n\n` +
      `**New Pull Request:** [#${newPrNumber} - ${aiResponse.pr_title}](${newPrUrl})\n\n` +
      `**Summary:** ${aiResponse.summary}\n\n` +
      `**Modified Files:**\n` +
      changedPaths.map((p) => `- \`${p}\``).join('\n');

    await gh.createIssueComment(prNumber, commentMsg);
    core.info('AntigravityCI completed successfully!');
    return 0;
  } catch (err) {
    core.error(`AntigravityCI execution failed: ${err.message}`);
    await gh.createIssueComment(
      prNumber,
      `❌ **AntigravityCI Error**: An unexpected error occurred.\n\`\`\`\n${err.message}\n\`\`\``
    );
    return 1;
  }
}
