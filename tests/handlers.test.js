import { describe, expect, it, vi } from 'vitest';
import { handleComment } from '../src/handlers/comment.js';
import { handlePrOpened } from '../src/handlers/prOpened.js';

describe('PR Opened Handler', () => {
  it('assigns and requests review from repo owner on PR open', async () => {
    const mockGh = {
      requestReviewers: vi.fn().mockResolvedValue(true),
      addAssignees: vi.fn().mockResolvedValue(true),
    };

    const eventData = {
      action: 'opened',
      pull_request: {
        number: 10,
        user: { login: 'collaborator_dev' },
      },
    };

    const code = await handlePrOpened(mockGh, eventData, 'repo_owner');
    expect(code).toBe(0);
    expect(mockGh.requestReviewers).toHaveBeenCalledWith(10, ['repo_owner']);
    expect(mockGh.addAssignees).toHaveBeenCalledWith(10, ['repo_owner']);
  });

  it('skips assigning repo owner if the PR author is the repo owner', async () => {
    const mockGh = {
      requestReviewers: vi.fn().mockResolvedValue(true),
      addAssignees: vi.fn().mockResolvedValue(true),
    };

    const eventData = {
      action: 'opened',
      pull_request: {
        number: 10,
        user: { login: 'repo_owner' },
      },
    };

    const code = await handlePrOpened(mockGh, eventData, 'repo_owner');
    expect(code).toBe(0);
    expect(mockGh.requestReviewers).not.toHaveBeenCalled();
    expect(mockGh.addAssignees).not.toHaveBeenCalled();
  });
});

describe('PR Comment Security & Trigger Checks', () => {
  it('ignores comments from unauthorized roles', async () => {
    const mockGh = {
      addCommentReaction: vi.fn(),
      createIssueComment: vi.fn(),
    };

    const eventData = {
      issue: { number: 5, pull_request: {} },
      comment: {
        id: 123,
        body: '@antigravity refactor loop',
        author_association: 'NONE',
        user: { login: 'random_user', type: 'User' },
      },
    };

    const code = await handleComment(mockGh, eventData, {});
    expect(code).toBe(0);
    expect(mockGh.addCommentReaction).not.toHaveBeenCalled();
  });

  it('ignores bot-authored comments to prevent infinite loops', async () => {
    const mockGh = {
      addCommentReaction: vi.fn(),
      createIssueComment: vi.fn(),
    };

    const eventData = {
      issue: { number: 5, pull_request: {} },
      comment: {
        id: 123,
        body: '@antigravity refactor loop',
        author_association: 'OWNER',
        user: { login: 'antigravityci[bot]', type: 'Bot' },
      },
    };

    const code = await handleComment(mockGh, eventData, {});
    expect(code).toBe(0);
    expect(mockGh.addCommentReaction).not.toHaveBeenCalled();
  });

  it('ignores comments on regular issues (non-PRs)', async () => {
    const mockGh = {
      addCommentReaction: vi.fn(),
      createIssueComment: vi.fn(),
    };

    const eventData = {
      issue: { number: 5 }, // No pull_request key
      comment: {
        id: 123,
        body: '@antigravity refactor loop',
        author_association: 'OWNER',
        user: { login: 'repo_owner', type: 'User' },
      },
    };

    const code = await handleComment(mockGh, eventData, {});
    expect(code).toBe(0);
    expect(mockGh.addCommentReaction).not.toHaveBeenCalled();
  });
});
