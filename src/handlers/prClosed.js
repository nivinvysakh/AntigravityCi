/**
 * AntigravityCI - PR Closed Event Handler
 */

import * as core from '@actions/core';

/**
 * Handle Pull Request closed event (deletes bot feature branches).
 *
 * @param {import('../github.js').GitHubClient} gh
 * @param {any} eventData
 * @returns {Promise<number>}
 */
export async function handlePrClosed(gh, eventData) {
  const pr = eventData.pull_request;
  if (!pr) return 0;

  const prNumber = pr.number;
  const headRef = pr.head?.ref || '';

  core.info(`Handling PR #${prNumber} closed event for branch '${headRef}'...`);

  // Only delete branches created by AntigravityCI
  if (headRef.startsWith('antigravityci/')) {
    core.info(
      `PR #${prNumber} closed. Cleaning up AntigravityCI branch: ${headRef}`
    );
    const success = await gh.deleteBranch(headRef);
    if (success) {
      core.info(`Successfully deleted branch '${headRef}'.`);
    } else {
      core.warning(`Could not delete branch '${headRef}'.`);
    }
  } else {
    core.info(
      `Branch '${headRef}' was not created by AntigravityCI. Preserving branch.`
    );
  }

  return 0;
}
