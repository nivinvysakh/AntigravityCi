/**
 * AntigravityCI - PR Comment Event Handler
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { AUTHORIZED_ROLES } from '../config.js';
import { loadProjectConfig } from '../configLoader.js';
import { isSafeTextFile, readFileSafely } from '../filters.js';
import { callAiEngine } from '../gemini.js';
import { runGitCommand } from '../github.js';
import { parseCommentCommand } from '../parser.js';

/**
 * Render a formatted AI Risk & Quality scorecard markdown table.
 *
 * @param {string} riskLevel - 'LOW', 'MEDIUM', or 'HIGH'
 * @param {boolean} breakingChanges - boolean
 * @param {number} filesCount - count of modified files
 * @returns {string} Markdown scorecard block
 */
function renderScorecard(riskLevel, breakingChanges, filesCount) {
  const riskBadge =
    riskLevel?.toUpperCase() === 'LOW'
      ? '🟢 **Low**'
      : riskLevel?.toUpperCase() === 'MEDIUM'
      ? '🟡 **Medium**'
      : '🔴 **High**';

  const breakingBadge = breakingChanges
    ? '⚠️ **Yes (Breaking)**'
    : '✅ **None (Backward Compatible)**';

  return (
    '### 📊 AI Quality & Risk Scorecard\n\n' +
    '| Metric | Assessment |\n' +
    '|---|---|\n' +
    `| 🛡️ **Risk Level** | ${riskBadge} |\n` +
    `| ⚠️ **Breaking Changes** | ${breakingBadge} |\n` +
    `| 📁 **Files Changed** | \`${filesCount} file(s)\` |\n`
  );
}

/**
 * Render an optional Mermaid diagram if provided.
 *
 * @param {string} [diagram]
 * @returns {string}
 */
function renderDiagram(diagram) {
  if (!diagram || typeof diagram !== 'string' || !diagram.trim()) {
    return '';
  }
  const clean = diagram
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/\s*```$/i, '');
  return `### 🎨 Architecture & Flow Diagram\n\n\`\`\`mermaid\n${clean}\n\`\`\`\n\n`;
}

/**
 * Handle issue_comment event on a Pull Request.
 *
 * @param {import('../github.js').GitHubClient} gh
 * @param {any} eventData
 * @param {Object} options
 * @param {string} [options.geminiApiKey]
 * @param {string} [options.modelName='gemini-3.6-flash']
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
    modelName: defaultModelName = 'gemini-3.6-flash',
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

  // 3. Parse command and flags from comment
  const parsed = parseCommentCommand(commentBody, botName);
  if (!parsed) {
    core.info(`Comment does not contain a command for ${botName}. Skipping.`);
    return 0;
  }

  // Allow inline flag override for model (e.g. --model=gemini-3.7-flash)
  const activeModelName =
    (typeof parsed.flags.model === 'string' && parsed.flags.model) ||
    defaultModelName;

  core.info(
    `Triggered by @${commentAuthor} (${authorAssociation}) on PR #${prNumber}: command='${parsed.command}', instruction='${parsed.instruction}', model='${activeModelName}'`
  );

  // 4. Acknowledge with thumbs-up reaction and instant replay comment
  await gh.addCommentReaction(commentId, '+1');

  if (postAck) {
    const replayText = `@${botName.replace(/^@/, '')} ${parsed.command} ${parsed.instruction}`.trim();
    const ackMessage =
      `🤖 **AntigravityCI**: ${parsed.actionVerb} for @${commentAuthor}!\n\n` +
      `> 💬 **Instruction Replay:** \`${replayText}\`\n\n` +
      `⏳ Analyzing PR #${prNumber} modified files with Google Gemini (${activeModelName}). Generating response...`;

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

  // If command is 'fix-ci', fetch failing CI check runs summary
  let ciLogsSummary = '';
  if (parsed.command === 'fix-ci') {
    core.info(`Fetching failing CI check run summaries for commit SHA ${headSha}...`);
    ciLogsSummary = await gh.getFailedCheckRunsSummary(headSha);
  }

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
      ignoredFilesLog.push(`\`${filename}\` (${safeCheck.reason})`);
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

  // 7. Load custom team rules from .antigravity.json if present
  const projectConfig = loadProjectConfig();
  let customRulesText = '';
  if (projectConfig?.rules?.length) {
    customRulesText =
      '\nTeam Coding Standards & Project Rules:\n- ' +
      projectConfig.rules.join('\n- ') +
      '\n';
  }

  // 8. Construct prompt for AI Engine
  const systemInstruction =
    'You are AntigravityCI, an elite AI software engineer and code reviewer.\n' +
    `Your task is to fulfill the user's PR command: '${parsed.command}' by analyzing the provided files, diffs, and instructions.\n` +
    'Rules:\n' +
    "1. For commands that modify code ('refactor', 'fix', 'fix-ci', 'test', 'doc', 'security', 'perf', 'types'):\n" +
    '   - Return complete updated file content in `modified_files` for every modified file.\n' +
    "   - Do NOT truncate code with comments like '// rest of code stays same'. Always return full working files.\n" +
    "2. For read-only analysis commands ('explain', 'changelog'):\n" +
    '   - Leave `modified_files` as an empty list [] and provide a comprehensive markdown breakdown in `explanation`.\n' +
    "3. For 'review' command:\n" +
    '   - Return `inline_comments` with specific lines and GitHub suggestion replacement snippets if applicable.\n' +
    "4. For 'polish-pr' command:\n" +
    '   - Return an optimized conventional `pr_title` and comprehensive markdown `pr_body` with summary, test checklist, and overview.\n' +
    '5. When explaining architecture or complex logic, generate a clean Mermaid sequence/flow diagram in `diagram`.\n' +
    '6. Evaluate `risk_level` as LOW, MEDIUM, or HIGH, and indicate `breaking_changes` (true/false).\n' +
    customRulesText;

  const promptPayload = {
    command: parsed.command,
    instruction: parsed.instruction,
    flags: parsed.flags,
    ci_failure_summary: ciLogsSummary || undefined,
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
    `Command: ${parsed.command}\n` +
    `Instruction: ${parsed.instruction || 'Apply best practices and appropriate fixes/improvements.'}\n\n` +
    `Context JSON:\n${JSON.stringify(promptPayload, null, 2)}`;

  // 9. Call AI Engine (Google Gemini Cascade)
  let aiResponse;
  let engineUsed;
  try {
    const result = await callAiEngine(
      geminiApiKey,
      activeModelName,
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

  // Feature 4: Polish PR Mode (Directly updates PR Title & Description)
  if (parsed.isPolish) {
    const polishedTitle = aiResponse.pr_title || prTitle;
    const polishedBody =
      `${aiResponse.pr_body || aiResponse.explanation}\n\n` +
      renderDiagram(aiResponse.diagram) +
      renderScorecard(
        aiResponse.risk_level || 'LOW',
        aiResponse.breaking_changes || false,
        filesContext.length
      ) +
      `\n\n---\n*Polished by [AntigravityCI](https://github.com/nivinvysakh/AntigravityCi) via ${engineUsed}.*`;

    await gh.updatePullRequest(prNumber, {
      title: polishedTitle,
      body: polishedBody,
    });

    await gh.createIssueComment(
      prNumber,
      `✨ **AntigravityCI**: Successfully polished PR #${prNumber}!\n\n` +
        `- **New Title:** \`${polishedTitle}\`\n` +
        `- **Updated Description:** Enhanced with structured breakdown and risk metrics.`
    );
    core.info(`Successfully polished PR #${prNumber}`);
    return 0;
  }

  // Feature 2: Inline PR Review Comments Mode
  if (
    parsed.command === 'review' &&
    Array.isArray(aiResponse.inline_comments) &&
    aiResponse.inline_comments.length > 0
  ) {
    const reviewComments = aiResponse.inline_comments.map((item) => {
      let bodyText = item.comment;
      if (item.suggestion) {
        bodyText += `\n\n\`\`\`suggestion\n${item.suggestion}\n\`\`\``;
      }
      return {
        path: item.path,
        line: item.line,
        body: bodyText,
      };
    });

    const reviewHeader =
      `## 🔍 AntigravityCI Code Review\n\n` +
      renderScorecard(
        aiResponse.risk_level || 'LOW',
        aiResponse.breaking_changes || false,
        filesContext.length
      ) +
      `\n### 📋 Summary\n${aiResponse.summary}\n\n` +
      `### 🔍 Detailed Audit\n${aiResponse.explanation}\n\n` +
      renderDiagram(aiResponse.diagram);

    await gh.createPullRequestReview(prNumber, {
      body: reviewHeader,
      comments: reviewComments,
    });

    core.info(`Posted inline review with ${reviewComments.length} suggestions on PR #${prNumber}`);
    return 0;
  }

  const hasModifiedFiles =
    Array.isArray(aiResponse.modified_files) &&
    aiResponse.modified_files.length > 0;

  // Feature 3: Comment-Only Mode (e.g. '@antigravity explain' or read-only analysis)
  if (parsed.isCommentOnly || !hasModifiedFiles) {
    const analysisComment =
      `## 💡 AntigravityCI: \`${parsed.command}\` Analysis\n\n` +
      `> 💬 **Instruction:** \`${parsed.botName} ${parsed.command} ${parsed.instruction}\`\n\n` +
      renderScorecard(
        aiResponse.risk_level || 'LOW',
        aiResponse.breaking_changes || false,
        0
      ) +
      renderDiagram(aiResponse.diagram) +
      `\n### 📋 Summary\n${aiResponse.summary}\n\n` +
      `### 🔍 Detailed Explanation & Findings\n${aiResponse.explanation}\n\n` +
      `---\n*Generated with 🧠 [${engineUsed}](https://github.com/${gh.repository}) via [AntigravityCI](https://github.com/nivinvysakh/AntigravityCi).*`;

    await gh.createIssueComment(prNumber, analysisComment);
    core.info('AntigravityCI comment analysis posted successfully!');
    return 0;
  }

  // Feature 1: Code Modifying Commands & Self-Healing Fix-CI PRs
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

    // Open a new Pull Request with AI Scorecard & Mermaid Diagram
    const repoSlug = gh.repository;
    const formattedBody =
      `## 🤖 AntigravityCI: \`${parsed.command}\`\n\n` +
      `Triggered by @${commentAuthor} on original PR #${prNumber} ([comment](${commentHtmlUrl})):\n` +
      `> \`${parsed.botName} ${parsed.command} ${parsed.instruction}\`\n\n` +
      renderScorecard(
        aiResponse.risk_level || 'LOW',
        aiResponse.breaking_changes || false,
        changedPaths.length
      ) +
      renderDiagram(aiResponse.diagram) +
      `\n### 📋 Summary\n${aiResponse.summary}\n\n` +
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

    // Post confirmation comment to original PR thread
    const commentMsg =
      `🚀 **AntigravityCI**: Successfully processed \`${parsed.command}\`!\n\n` +
      `**New Pull Request:** [#${newPrNumber} - ${aiResponse.pr_title}](${newPrUrl})\n\n` +
      `**Summary:** ${aiResponse.summary}\n\n` +
      `**Risk Assessment:** ${aiResponse.risk_level || 'LOW'}\n\n` +
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
