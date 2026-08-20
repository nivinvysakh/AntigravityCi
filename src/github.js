/**
 * AntigravityCI - GitHub API Client & Git Operations
 */

import { execFileSync } from 'node:child_process';
import * as core from '@actions/core';
import * as github from '@actions/github';

/**
 * Execute a Git CLI command safely.
 *
 * @param {string[]} args - Git arguments
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {string} Command stdout output
 */
export function runGitCommand(args, cwd = process.cwd()) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
    throw new Error(`Git command 'git ${args.join(' ')}' failed: ${stderr}`);
  }
}

/**
 * GitHub API client wrapping Octokit REST API.
 */
export class GitHubClient {
  /**
   * @param {string} token - GitHub Token
   * @param {string} repository - 'owner/repo' format
   */
  constructor(token, repository) {
    this.token = token;
    this.repository = repository;
    const [owner, repo] = repository.split('/');
    this.owner = owner;
    this.repo = repo;
    this.octokit = github.getOctokit(token);
  }

  /**
   * Fetch Pull Request metadata.
   *
   * @param {number} prNumber
   * @returns {Promise<any>}
   */
  async getPullRequest(prNumber) {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  /**
   * Update Pull Request title and body (for @antigravity polish-pr).
   *
   * @param {number} prNumber
   * @param {Object} updateData
   * @param {string} [updateData.title]
   * @param {string} [updateData.body]
   * @returns {Promise<any>}
   */
  async updatePullRequest(prNumber, updateData) {
    const { data } = await this.octokit.rest.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      ...updateData,
    });
    return data;
  }

  /**
   * Fetch all modified files in a Pull Request with pagination.
   *
   * @param {number} prNumber
   * @returns {Promise<any[]>}
   */
  async getPrFiles(prNumber) {
    return await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      per_page: 100,
    });
  }

  /**
   * Fetch file content from GitHub API if not available locally.
   *
   * @param {string} path
   * @param {string} ref
   * @returns {Promise<string|null>}
   */
  async getFileContent(path, ref) {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });

      if (data && 'content' in data && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
    } catch (err) {
      core.warning(`Failed to fetch content for ${path} at ${ref}: ${err.message}`);
    }
    return null;
  }

  /**
   * Fetch latest failing check runs or workflow error summaries for a git ref (for @antigravity fix-ci).
   *
   * @param {string} ref - Commit SHA or branch ref
   * @returns {Promise<string>} Error summaries
   */
  async getFailedCheckRunsSummary(ref) {
    try {
      const { data } = await this.octokit.rest.checks.listForRef({
        owner: this.owner,
        repo: this.repo,
        ref,
      });

      const failedRuns = (data.check_runs || []).filter(
        (c) => c.conclusion === 'failure' || c.conclusion === 'timed_out'
      );

      if (failedRuns.length === 0) {
        return 'No explicitly failed check runs reported via Checks API.';
      }

      const summaries = failedRuns.map((r) => {
        const title = r.name || 'Check';
        const text = r.output?.text || r.output?.summary || r.output?.title || 'Execution failed';
        return `### ❌ Check: ${title}\n${text}`;
      });

      return summaries.join('\n\n');
    } catch (err) {
      core.warning(`Could not fetch check runs for ref ${ref}: ${err.message}`);
      return `Check runs unavailable: ${err.message}`;
    }
  }

  /**
   * Post line-by-line review comments with one-click code suggestions.
   *
   * @param {number} prNumber
   * @param {Object} options
   * @param {string} options.body
   * @param {string} [options.event='COMMENT'] - 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'
   * @param {Array<{ path: string, line: number, body: string }>} options.comments
   * @returns {Promise<any>}
   */
  async createPullRequestReview(prNumber, { body, event = 'COMMENT', comments = [] }) {
    try {
      const { data } = await this.octokit.rest.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        body,
        event,
        comments,
      });
      core.info(`Posted PR review with ${comments.length} inline suggestion(s) on #${prNumber}`);
      return data;
    } catch (err) {
      core.warning(`Failed to post inline PR review: ${err.message}. Falling back to standard issue comment.`);
      return await this.createIssueComment(prNumber, `${body}\n\n**Suggestions:**\n` + comments.map((c) => `- **${c.path}:${c.line}**\n${c.body}`).join('\n\n'));
    }
  }

  /**
   * Add an emoji reaction (+1) to a PR / issue comment.
   *
   * @param {number} commentId
   * @param {string} [reaction='+1']
   * @returns {Promise<boolean>}
   */
  async addCommentReaction(commentId, reaction = '+1') {
    try {
      await this.octokit.rest.reactions.createForIssueComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: commentId,
        content: reaction,
      });
      core.info(`Reacted '${reaction}' to comment ${commentId}`);
      return true;
    } catch (err) {
      core.warning(`Could not add reaction to comment ${commentId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Post a markdown comment on a PR / Issue thread.
   *
   * @param {number} issueNumber
   * @param {string} body
   * @returns {Promise<any>}
   */
  async createIssueComment(issueNumber, body) {
    try {
      const { data } = await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
      });
      return data;
    } catch (err) {
      core.error(`Failed to post comment on #${issueNumber}: ${err.message}`);
      return null;
    }
  }

  /**
   * Create a new Pull Request.
   *
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.body
   * @param {string} options.head
   * @param {string} options.base
   * @returns {Promise<any>}
   */
  async createPullRequest({ title, body, head, base }) {
    const { data } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      head,
      base,
    });
    return data;
  }

  /**
   * Request review from specified users on a Pull Request.
   *
   * @param {number} prNumber
   * @param {string[]} reviewers
   * @returns {Promise<boolean>}
   */
  async requestReviewers(prNumber, reviewers) {
    if (!reviewers || reviewers.length === 0) return false;
    try {
      await this.octokit.rest.pulls.requestReviewers({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        reviewers,
      });
      core.info(`Requested review from [${reviewers.join(', ')}] on PR #${prNumber}`);
      return true;
    } catch (err) {
      core.warning(`Could not request review on PR #${prNumber}: ${err.message}`);
      return false;
    }
  }

  /**
   * Add assignees to a Pull Request or Issue.
   *
   * @param {number} issueNumber
   * @param {string[]} assignees
   * @returns {Promise<boolean>}
   */
  async addAssignees(issueNumber, assignees) {
    if (!assignees || assignees.length === 0) return false;
    try {
      await this.octokit.rest.issues.addAssignees({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        assignees,
      });
      core.info(`Assigned [${assignees.join(', ')}] to PR #${issueNumber}`);
      return true;
    } catch (err) {
      core.warning(`Failed to add assignees to #${issueNumber}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete a remote Git branch ref via API with fallback to CLI.
   *
   * @param {string} branchName
   * @returns {Promise<boolean>}
   */
  async deleteBranch(branchName) {
    try {
      await this.octokit.rest.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`,
      });
      core.info(`Deleted remote branch via API: ${branchName}`);
      return true;
    } catch (apiErr) {
      core.warning(`API branch deletion failed (${apiErr.message}), falling back to Git CLI...`);
      try {
        runGitCommand(['push', 'origin', '--delete', branchName]);
        core.info(`Deleted remote branch via Git CLI: ${branchName}`);
        return true;
      } catch (cliErr) {
        core.error(`Failed to delete branch ${branchName}: ${cliErr.message}`);
        return false;
      }
    }
  }
}
