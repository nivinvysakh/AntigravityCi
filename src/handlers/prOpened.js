/**
 * OrbitCI - PR Opened Event Handler
 */

import * as core from '@actions/core';

/**
 * Handle Pull Request opened event (assigns repo owner and requests review).
 *
 * @param {import('../github.js').GitHubClient} gh
 * @param {any} eventData
 * @param {string} repoOwner
 * @returns {Promise<number>}
 */
export async function handlePrOpened(gh, eventData, repoOwner) {
  const pr = eventData.pull_request;
  if (!pr) return 0;

  const prNumber = pr.number;
  const prAuthor = pr.user?.login || 'unknown';

  core.info(`PR #${prNumber} opened by @${prAuthor}.`);

  if (!repoOwner) {
    core.info('No repo owner identified to assign/request review.');
    return 0;
  }

  // Avoid assigning the repo owner to their own PR
  if (prAuthor.toLowerCase() === repoOwner.toLowerCase()) {
    core.info(`PR author is the repo owner (@${repoOwner}). Skipping self-review request.`);
    return 0;
  }

  core.info(`Requesting review from repo owner @${repoOwner} on PR #${prNumber}...`);
  await gh.requestReviewers(prNumber, [repoOwner]);
  await gh.addAssignees(prNumber, [repoOwner]);

  return 0;
}
