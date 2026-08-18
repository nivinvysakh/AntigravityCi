/**
 * AntigravityCI - Fast Instant Acknowledgment Script
 * 
 * Runs in <2s directly on ubuntu-latest using actions/github-script:
 * 1. Verifies author role permissions (OWNER, MEMBER, COLLABORATOR).
 * 2. Parses @antigravity / @antigravityci command and instruction.
 * 3. Reacts with 👍 (+1) to the comment immediately.
 * 4. Posts an instant instruction replay comment on the Pull Request.
 */

module.exports = async ({ github, context }) => {
  const comment = context.payload.comment;
  const issue = context.payload.issue;
  if (!comment || !issue) return;

  // 1. Security: Author role check
  const authorRole = comment.author_association;
  const allowedRoles = ['OWNER', 'MEMBER', 'COLLABORATOR'];
  if (!allowedRoles.includes(authorRole)) {
    console.log(`User role '${authorRole}' is not authorized. Skipping acknowledgment.`);
    return;
  }

  // 2. Parse command and instruction (@antigravity or @antigravityci)
  const body = comment.body.trim();
  const match = body.match(/@antigravity(?:ci)?\s+([a-zA-Z0-9_-]+)(?:\s+([\s\S]+))?/i);
  if (!match) {
    console.log('Comment does not contain @antigravity / @antigravityci command. Skipping.');
    return;
  }

  const cmd = match[1];
  const instruction = (match[2] || '').trim();
  const author = comment.user.login;

  // 3. React with +1 (thumbs up) immediately
  try {
    await github.rest.reactions.createForIssueComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: comment.id,
      content: '+1',
    });
  } catch (err) {
    console.log('Reaction error:', err.message);
  }

  // 4. Post instant instruction replay comment
  const actionVerb =
    cmd.toLowerCase() === 'refactor' || cmd.toLowerCase() === 'refactoring'
      ? 'Refactoring your code'
      : `Processing \`${cmd}\``;

  const replay = `@antigravityci ${cmd} ${instruction}`.trim();
  const message = `🤖 **AntigravityCI**: ${actionVerb} for @${author}!\n\n> 💬 **Instruction Replay:** \`${replay}\`\n\n⏳ Spawning AI engine and analyzing PR #${issue.number} modified files. I'll open a new PR shortly...`;

  try {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: message,
    });
  } catch (err) {
    console.log('Comment error:', err.message);
  }
};
