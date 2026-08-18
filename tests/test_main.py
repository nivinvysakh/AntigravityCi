"""
Unit tests for AntigravityCI PR assistant.
Tests safety filters, security author checks, command parsing, structured data schemas,
and the full end-to-end execution flow using mocks.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from main import (
    AUTHORIZED_ROLES,
    FileModification,
    GeminiPRResponse,
    is_safe_text_file,
    main,
    parse_comment_command,
    read_file_safely,
)


class TestSecurityAuthorCheck:
    """Test role verification for comment authors."""

    def test_authorized_roles(self):
        assert "OWNER" in AUTHORIZED_ROLES
        assert "MEMBER" in AUTHORIZED_ROLES
        assert "COLLABORATOR" in AUTHORIZED_ROLES

    def test_unauthorized_roles(self):
        unauthorized = ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "MANNEQUIN"]
        for role in unauthorized:
            assert role not in AUTHORIZED_ROLES


class TestCommentCommandParsing:
    """Test command extraction from GitHub PR comments."""

    def test_basic_command(self):
        body = "@antigravityci fix"
        parsed = parse_comment_command(body)
        assert parsed is not None
        assert parsed.command == "fix"
        assert parsed.instruction == ""

    def test_command_with_instruction(self):
        body = "@antigravityci refactor optimize this async loop for better throughput"
        parsed = parse_comment_command(body)
        assert parsed is not None
        assert parsed.command == "refactor"
        assert parsed.instruction == "optimize this async loop for better throughput"

    def test_multiline_instruction(self):
        body = """@antigravityci test
Please add comprehensive unit tests for the auth module.
Make sure to test edge cases with expired JWT tokens."""
        parsed = parse_comment_command(body)
        assert parsed is not None
        assert parsed.command == "test"
        assert "auth module" in parsed.instruction
        assert "expired JWT tokens" in parsed.instruction

    def test_custom_bot_name(self):
        body = "@my-custom-bot review check for memory leaks"
        parsed = parse_comment_command(body, bot_name="@my-custom-bot")
        assert parsed is not None
        assert parsed.command == "review"
        assert parsed.instruction == "check for memory leaks"

    def test_case_insensitivity(self):
        body = "@AntigravityCI REFACTOR clean up dead code"
        parsed = parse_comment_command(body)
        assert parsed is not None
        assert parsed.command == "refactor"
        assert parsed.instruction == "clean up dead code"

    def test_antigravity_alias_without_ci(self):
        body = "@AntiGravity doc add google-style docstrings"
        parsed = parse_comment_command(body)
        assert parsed is not None
        assert parsed.command == "doc"
        assert parsed.instruction == "add google-style docstrings"

    def test_irrelevant_comment_ignored(self):
        body = "Looks good to me! LGTM 🚀"
        parsed = parse_comment_command(body)
        assert parsed is None

    def test_mention_without_command_ignored(self):
        body = "Hey @antigravityci"
        parsed = parse_comment_command(body)
        assert parsed is None or parsed.command == ""


class TestSafetyFilters:
    """Test safety file filters (lockfiles, binary files, size limits)."""

    @pytest.mark.parametrize(
        "lockfile",
        [
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "bun.lockb",
            "poetry.lock",
            "Pipfile.lock",
            "Cargo.lock",
            "go.sum",
            "Gemfile.lock",
            "composer.lock",
            "flake.lock",
        ],
    )
    def test_ignores_lockfiles(self, lockfile):
        safe, reason = is_safe_text_file(lockfile, size_bytes=1024, max_file_size_kb=50)
        assert safe is False
        assert "lockfile" in reason.lower()

    @pytest.mark.parametrize(
        "binary_file",
        [
            "logo.png",
            "avatar.jpg",
            "banner.jpeg",
            "icon.ico",
            "diagram.pdf",
            "bundle.zip",
            "archive.tar.gz",
            "binary.exe",
            "lib.so",
            "font.woff2",
            "cache.pyc",
            "database.sqlite3",
        ],
    )
    def test_ignores_binary_files(self, binary_file):
        safe, reason = is_safe_text_file(binary_file, size_bytes=2048, max_file_size_kb=50)
        assert safe is False
        assert "binary" in reason.lower()

    def test_oversized_file(self):
        filename = "huge_data.json"
        safe, reason = is_safe_text_file(filename, size_bytes=60 * 1024, max_file_size_kb=50)
        assert safe is False
        assert "oversized" in reason.lower()

    @pytest.mark.parametrize(
        "valid_code_file",
        [
            "src/index.ts",
            "app/main.py",
            "internal/server.go",
            "components/Button.jsx",
            "README.md",
            "config.yaml",
        ],
    )
    def test_allows_valid_code_files(self, valid_code_file):
        safe, reason = is_safe_text_file(valid_code_file, size_bytes=10 * 1024, max_file_size_kb=50)
        assert safe is True
        assert reason == "Safe"


class TestSafeFileReader:
    """Test reading local files safely with size checks."""

    def test_read_existing_valid_file(self, tmp_path):
        test_file = tmp_path / "sample.py"
        test_file.write_text("print('hello world')", encoding="utf-8")

        content = read_file_safely(str(test_file), max_file_size_kb=50)
        assert content == "print('hello world')"

    def test_read_oversized_file(self, tmp_path):
        test_file = tmp_path / "large.py"
        test_file.write_text("a" * (60 * 1024), encoding="utf-8")

        content = read_file_safely(str(test_file), max_file_size_kb=50)
        assert content is None

    def test_nonexistent_file(self, tmp_path):
        content = read_file_safely(str(tmp_path / "does_not_exist.py"), max_file_size_kb=50)
        assert content is None


class TestPydanticSchemas:
    """Test schema validation for Gemini structured output."""

    def test_valid_gemini_response_parsing(self):
        payload = {
            "summary": "Optimized database query loop with batching.",
            "explanation": "Replaced individual SELECT queries with a single batch `IN` query to eliminate N+1 latency.",
            "pr_title": "perf(db): batch user queries to eliminate N+1 queries",
            "pr_body": "## Summary\nBatches user lookups.",
            "modified_files": [
                {
                    "path": "src/db.py",
                    "action": "modify",
                    "content": "def fetch_users(ids):\n    return db.query(...)",
                }
            ],
        }
        resp = GeminiPRResponse(**payload)
        assert resp.summary == "Optimized database query loop with batching."
        assert len(resp.modified_files) == 1
        assert resp.modified_files[0].path == "src/db.py"
        assert resp.modified_files[0].action == "modify"


class TestEndToEndExecution:
    """Test main() execution paths with mocked external services."""

    def test_unauthorized_user_ignored(self, tmp_path, monkeypatch):
        event_payload = {
            "issue": {"number": 10, "pull_request": {"url": "..."}},
            "comment": {
                "id": 12345,
                "body": "@antigravityci fix all bugs",
                "author_association": "NONE",
                "user": {"login": "attacker"},
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GEMINI_API_KEY", "dummy_key")
        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "org/repo")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        ret = main()
        assert ret == 0

    def test_non_pr_issue_ignored(self, tmp_path, monkeypatch):
        event_payload = {
            "issue": {"number": 10},  # No pull_request key
            "comment": {
                "id": 12345,
                "body": "@antigravityci fix something",
                "author_association": "MEMBER",
                "user": {"login": "member_user"},
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GEMINI_API_KEY", "dummy_key")
        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "org/repo")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        ret = main()
        assert ret == 0

    @patch("main.GitHubClient")
    @patch("main.call_ai_engine")
    @patch("main.run_cmd")
    def test_successful_flow(self, mock_run_cmd, mock_call_ai, mock_gh_cls, tmp_path, monkeypatch):
        # Create a dummy modified file
        test_file = tmp_path / "calc.py"
        test_file.write_text("def add(a, b): return a - b", encoding="utf-8")

        event_payload = {
            "issue": {"number": 42, "pull_request": {"url": "..."}},
            "comment": {
                "id": 999,
                "body": "@antigravityci fix addition bug",
                "author_association": "MEMBER",
                "user": {"login": "dev_collaborator"},
                "html_url": "https://github.com/org/repo/pull/42#issuecomment-999",
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GEMINI_API_KEY", "dummy_key")
        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "org/repo")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        mock_gh = MagicMock()
        mock_gh.get_pull_request.return_value = {
            "base": {"ref": "main"},
            "head": {"ref": "feature-1"},
            "title": "Add calculator features",
            "user": {"login": "dev_collaborator"},
        }
        mock_gh.get_pr_files.return_value = [
            {"filename": str(test_file), "status": "modified", "changes": 1, "raw_url_size": 30}
        ]
        mock_gh.create_pull_request.return_value = {
            "html_url": "https://github.com/org/repo/pull/43",
            "number": 43,
        }
        mock_gh_cls.return_value = mock_gh

        mock_call_ai.return_value = (
            GeminiPRResponse(
                summary="Fixed addition logic.",
                explanation="Changed minus operator to plus in add function.",
                pr_title="fix(calc): correct addition operator",
                pr_body="Fixes the calculation bug.",
                modified_files=[
                    FileModification(
                        path=str(test_file),
                        action="modify",
                        content="def add(a, b): return a + b\n",
                    )
                ],
            ),
            "gemini-2.5-flash",
        )

        ret = main()
        assert ret == 0

        # Assertions on mocks
        mock_gh.add_comment_reaction.assert_any_call(999, "+1")
        mock_gh.create_pull_request.assert_called_once()
        assert mock_gh.create_issue_comment.call_count == 2

        # Check initial acknowledgment replay message
        first_comment = mock_gh.create_issue_comment.call_args_list[0][0][1]
        assert "Processing `fix`" in first_comment or "AntigravityCI" in first_comment
        assert "@antigravityci fix addition bug" in first_comment

        mock_gh.add_comment_reaction.assert_any_call(999, "rocket")

    @patch("main.GitHubClient")
    @patch("main.call_ai_engine")
    @patch("main.run_cmd")
    def test_refactor_command_replays_message(self, mock_run_cmd, mock_call_ai, mock_gh_cls, tmp_path, monkeypatch):
        test_file = tmp_path / "service.py"
        test_file.write_text("def run(): pass", encoding="utf-8")

        event_payload = {
            "issue": {"number": 101, "pull_request": {"url": "..."}},
            "comment": {
                "id": 555,
                "body": "@antigravityci refactor optimize this async loop",
                "author_association": "OWNER",
                "user": {"login": "senior_dev"},
                "html_url": "https://github.com/org/repo/pull/101#issuecomment-555",
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GEMINI_API_KEY", "dummy_key")
        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "org/repo")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        mock_gh = MagicMock()
        mock_gh.get_pull_request.return_value = {
            "base": {"ref": "main"},
            "head": {"ref": "patch-1"},
            "title": "Service update",
            "user": {"login": "senior_dev"},
        }
        mock_gh.get_pr_files.return_value = [
            {"filename": str(test_file), "status": "modified", "changes": 1, "raw_url_size": 20}
        ]
        mock_gh.create_pull_request.return_value = {
            "html_url": "https://github.com/org/repo/pull/102",
            "number": 102,
        }
        mock_gh_cls.return_value = mock_gh

        mock_call_ai.return_value = (
            GeminiPRResponse(
                summary="Optimized async loop.",
                explanation="Used asyncio.gather.",
                pr_title="refactor: optimize async loop",
                pr_body="Detailed body.",
                modified_files=[
                    FileModification(
                        path=str(test_file),
                        action="modify",
                        content="async def run(): await asyncio.gather()",
                    )
                ],
            ),
            "local-qwen2.5-coder-1.5b",
        )

        ret = main()
        assert ret == 0

        # Check initial acknowledgment replay message
        first_comment = mock_gh.create_issue_comment.call_args_list[0][0][1]
        assert "Refactoring your code" in first_comment
        assert "@antigravityci refactor optimize this async loop" in first_comment
        assert "@senior_dev" in first_comment

    def test_call_ai_engine_missing_key_raises(self):
        from main import call_ai_engine
        import pytest

        with pytest.raises(ValueError, match="Missing GEMINI_API_KEY"):
            call_ai_engine(
                gemini_api_key=None,
                model_name="gemini-3.6-flash",
                prompt="Test prompt",
                system_instruction="System instruction",
            )

    @patch("main.GitHubClient")
    def test_pr_closed_cleans_up_bot_branch(self, mock_gh_cls, tmp_path, monkeypatch):
        event_payload = {
            "action": "closed",
            "pull_request": {
                "number": 15,
                "merged": False,
                "head": {"ref": "antigravityci/refactor-pr14-abc123"},
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "nivinvysakh/AntigravityCi")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        mock_gh = MagicMock()
        mock_gh.delete_branch.return_value = True
        mock_gh_cls.return_value = mock_gh

        ret = main()
        assert ret == 0

        mock_gh.delete_branch.assert_called_once_with("antigravityci/refactor-pr14-abc123")
        mock_gh.create_issue_comment.assert_called_once()
        assert (
            "Successfully deleted branch `antigravityci/refactor-pr14-abc123`"
            in mock_gh.create_issue_comment.call_args[0][1]
        )

    @patch("main.GitHubClient")
    def test_pr_closed_does_not_delete_user_branch(self, mock_gh_cls, tmp_path, monkeypatch):
        event_payload = {
            "action": "closed",
            "pull_request": {
                "number": 16,
                "merged": False,
                "head": {"ref": "feature/user-custom-branch"},
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "nivinvysakh/AntigravityCi")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        mock_gh = MagicMock()
        mock_gh_cls.return_value = mock_gh

        ret = main()
        assert ret == 0

        mock_gh.delete_branch.assert_not_called()

    @patch("main.GitHubClient")
    def test_bot_authored_comment_ignored(self, mock_gh_cls, tmp_path, monkeypatch):
        event_payload = {
            "action": "created",
            "issue": {"number": 101, "pull_request": {"url": "..."}},
            "comment": {
                "id": 556,
                "body": "@antigravityci refactor optimize this code",
                "author_association": "OWNER",
                "user": {"login": "antigravityci[bot]", "type": "Bot"},
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "org/repo")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        ret = main()
        assert ret == 0
        mock_gh_cls.return_value.get_pull_request.assert_not_called()

    @patch("main.GitHubClient")
    def test_pr_opened_assigns_repo_owner(self, mock_gh_cls, tmp_path, monkeypatch):
        event_payload = {
            "action": "opened",
            "pull_request": {
                "number": 20,
                "head": {"ref": "antigravityci/fix-pr19-xyz789"},
                "user": {"login": "github-actions[bot]"},
            },
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        monkeypatch.setenv("GITHUB_TOKEN", "dummy_token")
        monkeypatch.setenv("GITHUB_REPOSITORY", "nivinvysakh/AntigravityCi")
        monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_file))

        mock_gh = MagicMock()
        mock_gh_cls.return_value = mock_gh

        ret = main()
        assert ret == 0

        mock_gh.request_reviewers.assert_called_once_with(20, ["nivinvysakh"])
        mock_gh.add_assignees.assert_called_once_with(20, ["nivinvysakh"])
