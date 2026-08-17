#!/usr/bin/env python3
"""
AntigravityCI - AI Pull Request Assistant powered by Google Gemini.
Triggers on PR comments matching `@antigravityci <command> <instruction>`,
analyzes modified PR files, generates code improvements using Gemini 3.7 Flash,
commits to a new branch, and creates a follow-up Pull Request.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import requests
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("antigravityci")

# Security: Allowed GitHub author associations
AUTHORIZED_ROLES: Set[str] = {"OWNER", "MEMBER", "COLLABORATOR"}

# Safety: Extensions to treat as binary
BINARY_EXTENSIONS: Set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
    ".pdf", ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".exe", ".bin",
    ".dll", ".so", ".dylib", ".woff", ".woff2", ".eot", ".ttf", ".otf",
    ".pyc", ".pyo", ".pyd", ".class", ".jar", ".war", ".mp3", ".mp4", ".mov",
    ".avi", ".flv", ".wav", ".db", ".sqlite", ".sqlite3"
}

# Safety: Lockfiles and generated files to ignore (all lowercase)
LOCKFILES: Set[str] = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "poetry.lock",
    "pipfile.lock",
    "cargo.lock",
    "go.sum",
    "gemfile.lock",
    "composer.lock",
    "flake.lock",
}


# ============================================================================
# Pydantic Schemas for Gemini Structured Output
# ============================================================================

class FileModification(BaseModel):
    path: str = Field(description="Relative path to the file in the repository")
    action: str = Field(description="Action to perform: 'modify', 'create', or 'delete'")
    content: str = Field(description="Complete updated file content. Must contain the entire file, not just a diff.")


class GeminiPRResponse(BaseModel):
    summary: str = Field(description="A concise 1-2 sentence summary of changes made.")
    explanation: str = Field(description="Detailed markdown explanation of the improvements made and rationale.")
    pr_title: str = Field(description="Conventional commit style PR title (e.g. 'refactor(api): optimize async request loop')")
    pr_body: str = Field(description="Complete markdown description for the new Pull Request.")
    modified_files: List[FileModification] = Field(description="List of files to modify, create, or delete.")


# ============================================================================
# GitHub API Client
# ============================================================================

class GitHubClient:
    """Lightweight wrapper for GitHub REST API calls."""

    def __init__(self, token: str, repo: str):
        self.repo = repo
        self.base_url = f"https://api.github.com/repos/{repo}"
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "AntigravityCI-Bot",
        })

    def get_pull_request(self, pr_number: int) -> Dict[str, Any]:
        """Fetch Pull Request details."""
        url = f"{self.base_url}/pulls/{pr_number}"
        resp = self.session.get(url)
        resp.raise_for_status()
        return resp.json()

    def get_pr_files(self, pr_number: int) -> List[Dict[str, Any]]:
        """Fetch all files modified in the Pull Request with pagination."""
        files: List[Dict[str, Any]] = []
        page = 1
        while True:
            url = f"{self.base_url}/pulls/{pr_number}/files?page={page}&per_page=100"
            resp = self.session.get(url)
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            files.extend(batch)
            page += 1
        return files

    def add_comment_reaction(self, comment_id: int, reaction: str = "+1") -> bool:
        """Add emoji reaction to an issue/PR comment."""
        url = f"{self.base_url}/issues/comments/{comment_id}/reactions"
        resp = self.session.post(url, json={"content": reaction})
        if resp.status_code in (200, 201):
            logger.info(f"Reacted '{reaction}' to comment {comment_id}")
            return True
        logger.warning(f"Failed to react to comment {comment_id}: {resp.status_code} {resp.text}")
        return False

    def create_issue_comment(self, issue_number: int, body: str) -> Optional[Dict[str, Any]]:
        """Post a comment on a PR / Issue."""
        url = f"{self.base_url}/issues/{issue_number}/comments"
        resp = self.session.post(url, json={"body": body})
        if resp.status_code in (200, 201):
            return resp.json()
        logger.error(f"Failed to create comment on issue {issue_number}: {resp.status_code} {resp.text}")
        return None

    def create_pull_request(
        self, title: str, body: str, head: str, base: str
    ) -> Dict[str, Any]:
        """Create a new Pull Request."""
        url = f"{self.base_url}/pulls"
        payload = {
            "title": title,
            "body": body,
            "head": head,
            "base": base,
        }
        resp = self.session.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


# ============================================================================
# Git Helper Functions
# ============================================================================

def run_cmd(cmd: List[str], check: bool = True, cwd: Optional[str] = None) -> subprocess.CompletedProcess:
    """Run a shell command safely."""
    logger.debug(f"Running: {' '.join(cmd)}")
    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=check,
        cwd=cwd,
    )
    return res


def setup_git_user():
    """Configure Git committer identity."""
    run_cmd(["git", "config", "user.name", "antigravityci[bot]"])
    run_cmd(["git", "config", "user.email", "antigravityci[bot]@users.noreply.github.com"])


# ============================================================================
# Safety and Parsing Utilities
# ============================================================================

@dataclass
class ParsedCommand:
    bot_name: str
    command: str
    instruction: str


def parse_comment_command(body: str, bot_name: str = "@antigravityci") -> Optional[ParsedCommand]:
    """
    Parse comment body to extract bot trigger command and instruction.
    Pattern: `@antigravityci <command> <instruction>` or `@antigravityci <command>`
    """
    clean_bot = re.escape(bot_name.lstrip("@"))
    pattern = rf"@{clean_bot}\s+([a-zA-Z0-9_-]+)(?:\s+([\s\S]+))?"
    match = re.search(pattern, body.strip(), re.IGNORECASE)
    if not match:
        return None

    cmd = match.group(1).lower()
    instruction = (match.group(2) or "").strip()
    return ParsedCommand(bot_name=bot_name, command=cmd, instruction=instruction)


def is_safe_text_file(filename: str, size_bytes: int, max_file_size_kb: int = 50) -> tuple[bool, str]:
    """
    Check if a file is safe for LLM context (not binary, not lockfile, not oversized).
    """
    path = Path(filename)
    
    # 1. Lockfiles
    if path.name.lower() in LOCKFILES:
        return False, f"Ignored lockfile: {path.name}"
    
    # 2. Binary extension
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return False, f"Ignored binary file extension: {path.suffix}"
    
    # 3. Oversized check
    max_bytes = max_file_size_kb * 1024
    if size_bytes > max_bytes:
        return False, f"Ignored oversized file ({size_bytes / 1024:.1f}KB > {max_file_size_kb}KB)"
    
    return True, "Safe"


def read_file_safely(file_path: str, max_file_size_kb: int = 50) -> Optional[str]:
    """Read local file content safely if it exists, is text, and under size limit."""
    p = Path(file_path)
    if not p.is_file():
        return None
    try:
        size = p.stat().st_size
        safe, reason = is_safe_text_file(file_path, size, max_file_size_kb)
        if not safe:
            logger.info(f"Skipping {file_path}: {reason}")
            return None
        return p.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as e:
        logger.warning(f"Could not read {file_path} as UTF-8: {e}")
        return None


# ============================================================================
# Gemini Generation
# ============================================================================

def call_gemini_with_retry(
    client: genai.Client,
    model: str,
    prompt: str,
    system_instruction: str,
    max_retries: int = 3,
) -> GeminiPRResponse:
    """Call Google Gemini using the `google-genai` SDK with retry & structured output."""
    delay = 2.0
    last_error: Optional[Exception] = None

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Calling Gemini ({model}) [Attempt {attempt}/{max_retries}]...")
            
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=GeminiPRResponse,
                    temperature=0.2,
                ),
            )
            
            if not response.text:
                raise ValueError("Empty response text received from Gemini.")
            
            data = json.loads(response.text)
            parsed_response = GeminiPRResponse(**data)
            return parsed_response

        except Exception as e:
            last_error = e
            logger.warning(f"Gemini API attempt {attempt} failed: {e}")
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2.0

    raise RuntimeError(f"Gemini API failed after {max_retries} attempts: {last_error}")


# ============================================================================
# Main Execution Flow
# ============================================================================

def main() -> int:
    logger.info("Starting AntigravityCI execution...")

    # Load Action Environment Variables
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    github_token = os.getenv("GITHUB_TOKEN")
    github_repository = os.getenv("GITHUB_REPOSITORY")
    github_event_path = os.getenv("GITHUB_EVENT_PATH")
    model_name = os.getenv("INPUT_MODEL", "gemini-3.7-flash")
    bot_name = os.getenv("INPUT_BOT_NAME", "@antigravityci")
    max_file_size_kb = int(os.getenv("INPUT_MAX_FILE_SIZE_KB", "50"))
    target_branch_input = os.getenv("INPUT_TARGET_BRANCH", "auto")

    if not gemini_api_key:
        logger.error("Missing GEMINI_API_KEY environment variable.")
        return 1

    if not github_token or not github_repository:
        logger.error("Missing GITHUB_TOKEN or GITHUB_REPOSITORY environment variable.")
        return 1

    if not github_event_path or not os.path.isfile(github_event_path):
        logger.error(f"Event file not found at GITHUB_EVENT_PATH: {github_event_path}")
        return 1

    # Parse GitHub event payload
    try:
        with open(github_event_path, "r", encoding="utf-8") as f:
            event_data = json.load(f)
    except Exception as e:
        logger.error(f"Failed to read GitHub event data: {e}")
        return 1

    # Ensure this is an issue_comment event on a Pull Request
    comment = event_data.get("comment")
    issue = event_data.get("issue")

    if not comment or not issue:
        logger.info("Event is not an issue_comment. Skipping AntigravityCI.")
        return 0

    if "pull_request" not in issue:
        logger.info("Comment is on an Issue, not a Pull Request. Skipping AntigravityCI.")
        return 0

    pr_number = issue.get("number")
    comment_id = comment.get("id")
    comment_body = comment.get("body", "")
    author_association = comment.get("author_association", "NONE")
    comment_author = comment.get("user", {}).get("login", "unknown")
    comment_html_url = comment.get("html_url", "")

    # Security check: Author association
    if author_association not in AUTHORIZED_ROLES:
        logger.warning(
            f"Security: User '{comment_author}' has role '{author_association}'. "
            f"Only {AUTHORIZED_ROLES} can trigger AntigravityCI. Ignoring."
        )
        return 0

    # Parse command from comment
    parsed = parse_comment_command(comment_body, bot_name=bot_name)
    if not parsed:
        logger.info(f"Comment does not contain command for {bot_name}. Skipping.")
        return 0

    logger.info(
        f"Triggered by @{comment_author} ({author_association}) on PR #{pr_number}: "
        f"command='{parsed.command}', instruction='{parsed.instruction}'"
    )

    gh = GitHubClient(token=github_token, repo=github_repository)

    # 1. Acknowledge with thumbs-up reaction and post replay acknowledgment comment
    try:
        gh.add_comment_reaction(comment_id, "+1")
    except Exception as e:
        logger.warning(f"Could not add reaction to comment: {e}")

    try:
        action_verb = (
            "Refactoring your code"
            if parsed.command in ("refactor", "refactoring")
            else f"Processing `{parsed.command}`"
        )
        replay_text = f"@{bot_name.lstrip('@')} {parsed.command} {parsed.instruction}".strip()
        ack_message = (
            f"🤖 **AntigravityCI**: {action_verb} for @{comment_author}!\n\n"
            f"> 💬 **Instruction Replay:** `{replay_text}`\n\n"
            f"⏳ Analyzing PR #{pr_number} modified files with Google Gemini ({model_name}). I'll create a branch and open a new PR shortly..."
        )
        gh.create_issue_comment(pr_number, ack_message)
    except Exception as e:
        logger.warning(f"Could not post initial acknowledgment message: {e}")

    # 2. Fetch PR details and modified files
    try:
        pr_info = gh.get_pull_request(pr_number)
        base_branch = pr_info["base"]["ref"]
        head_branch = pr_info["head"]["ref"]
        pr_title = pr_info["title"]
        pr_author = pr_info["user"]["login"]
        target_branch = base_branch if target_branch_input == "auto" else target_branch_input

        pr_files_raw = gh.get_pr_files(pr_number)
    except Exception as e:
        logger.error(f"Failed to fetch PR info or files: {e}")
        gh.create_issue_comment(
            pr_number,
            f"⚠️ **AntigravityCI Error**: Unable to fetch PR #{pr_number} metadata or files.\n```\n{e}\n```"
        )
        return 1

    # 3. Filter files and collect context
    files_context: List[Dict[str, str]] = []
    ignored_files_log: List[str] = []

    for f_meta in pr_files_raw:
        filename = f_meta.get("filename")
        status = f_meta.get("status")
        changes = f_meta.get("changes", 0)

        if status == "removed":
            continue

        safe, reason = is_safe_text_file(filename, f_meta.get("raw_url_size", 0), max_file_size_kb)
        if not safe:
            ignored_files_log.append(f"`{filename}` ({reason})")
            continue

        content = read_file_safely(filename, max_file_size_kb)
        if content is not None:
            files_context.append({
                "path": filename,
                "status": status,
                "patch": f_meta.get("patch", ""),
                "content": content,
            })

    if not files_context:
        msg = (
            f"ℹ️ **AntigravityCI**: No suitable text files found to process in PR #{pr_number} "
            f"(all files were binary, lockfiles, deleted, or >{max_file_size_kb}KB)."
        )
        if ignored_files_log:
            msg += f"\n\n**Ignored Files:**\n- " + "\n- ".join(ignored_files_log)
        gh.create_issue_comment(pr_number, msg)
        return 0

    # 4. Construct prompt for Gemini
    system_instruction = (
        "You are AntigravityCI, an expert AI software engineer and code reviewer. "
        "Your task is to fulfill the user's PR command by analyzing the provided files, diffs, "
        "and instructions, and producing high quality, production-grade updated files.\n"
        "Rules:\n"
        "1. Return complete file content for each modified file in `modified_files`.\n"
        "2. Do not truncate code with comments like '// rest of code stays same'. Always return full working files.\n"
        "3. Follow the repo's existing coding style, naming conventions, and patterns.\n"
        "4. Provide a clear, conventional commit PR title and detailed PR body."
    )

    prompt_payload = {
        "command": parsed.command,
        "instruction": parsed.instruction,
        "pr_info": {
            "number": pr_number,
            "title": pr_title,
            "author": pr_author,
            "base_branch": base_branch,
            "head_branch": head_branch,
        },
        "files": files_context,
    }
    user_prompt = (
        f"User Command: {parsed.command}\n"
        f"User Instruction: {parsed.instruction or 'Apply best practices and appropriate fixes/improvements.'}\n\n"
        f"Context JSON:\n{json.dumps(prompt_payload, indent=2)}"
    )

    # 5. Initialize GenAI Client and Call Gemini
    try:
        genai_client = genai.Client(api_key=gemini_api_key)
        ai_response = call_gemini_with_retry(
            client=genai_client,
            model=model_name,
            prompt=user_prompt,
            system_instruction=system_instruction,
        )
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        gh.create_issue_comment(
            pr_number,
            f"❌ **AntigravityCI Error**: Failed to process with Gemini ({model_name}).\n```\n{e}\n```"
        )
        return 1

    if not ai_response.modified_files:
        gh.create_issue_comment(
            pr_number,
            f"ℹ️ **AntigravityCI**: Gemini analyzed PR #{pr_number} but determined no file modifications were necessary.\n\n"
            f"**Explanation:**\n{ai_response.explanation}"
        )
        return 0

    # 6. Create Git branch and commit changes
    short_id = uuid.uuid4().hex[:6]
    clean_cmd = re.sub(r"[^a-zA-Z0-9_-]", "-", parsed.command).lower()
    new_branch_name = f"antigravityci/{clean_cmd}-pr{pr_number}-{short_id}"

    try:
        setup_git_user()

        # Checkout and create new branch
        run_cmd(["git", "checkout", "-b", new_branch_name])

        # Write files
        changed_paths: List[str] = []
        for mod in ai_response.modified_files:
            file_path = Path(mod.path)
            if mod.action == "delete":
                if file_path.exists():
                    file_path.unlink()
                    run_cmd(["git", "rm", "-f", str(file_path)])
                    changed_paths.append(str(file_path))
            else:
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(mod.content, encoding="utf-8")
                run_cmd(["git", "add", str(file_path)])
                changed_paths.append(str(file_path))

        # Commit and push
        commit_msg = (
            f"[antigravityci] {parsed.command}: {parsed.instruction or 'AI improvements'}\n\n"
            f"Triggered by comment on PR #{pr_number} by @{comment_author}.\n"
            f"{ai_response.summary}"
        )
        run_cmd(["git", "commit", "-m", commit_msg])
        run_cmd(["git", "push", "origin", new_branch_name])
        logger.info(f"Pushed branch {new_branch_name} to origin.")

    except Exception as e:
        logger.error(f"Git operation failed: {e}")
        gh.create_issue_comment(
            pr_number,
            f"❌ **AntigravityCI Error**: Failed during Git commit/push for branch `{new_branch_name}`.\n```\n{e}\n```"
        )
        return 1

    # 7. Create New Pull Request
    try:
        pr_body_formatted = (
            f"## 🤖 AntigravityCI: `{parsed.command}`\n\n"
            f"Triggered by @{comment_author} on original PR #{pr_number} ([comment]({comment_html_url})):\n"
            f"> `{parsed.bot_name} {parsed.command} {parsed.instruction}`\n\n"
            f"### 📋 Summary\n{ai_response.summary}\n\n"
            f"### 🔍 Detailed Explanation\n{ai_response.explanation}\n\n"
            f"### 📁 Modified Files ({len(changed_paths)})\n"
            + "\n".join(f"- `{p}`" for p in changed_paths)
            + f"\n\n---\n*Created by [AntigravityCI](https://github.com/{github_repository}) powered by Google Gemini ({model_name}).*"
        )

        new_pr = gh.create_pull_request(
            title=ai_response.pr_title or f"[antigravityci] {parsed.command} on PR #{pr_number}",
            body=pr_body_formatted,
            head=new_branch_name,
            base=target_branch,
        )
        new_pr_url = new_pr.get("html_url", "")
        new_pr_number = new_pr.get("number")
        logger.info(f"Created new PR #{new_pr_number} at {new_pr_url}")

    except Exception as e:
        logger.error(f"Failed to create new Pull Request: {e}")
        gh.create_issue_comment(
            pr_number,
            f"⚠️ **AntigravityCI**: Pushed branch `{new_branch_name}` but failed to open PR against `{target_branch}`.\n```\n{e}\n```"
        )
        return 1

    # 8. Reply to the original PR comment
    try:
        reply_comment = (
            f"### 🚀 AntigravityCI Complete!\n\n"
            f"I've processed your command (`@{bot_name.lstrip('@')} {parsed.command}`) and opened a new Pull Request:\n\n"
            f"👉 **[#{new_pr_number} - {ai_response.pr_title}]({new_pr_url})** (targeting `{target_branch}`)\n\n"
            f"**Summary of Changes:**\n"
            f"{ai_response.summary}\n\n"
            f"<details>\n<summary><b>Modified Files ({len(changed_paths)})</b></summary>\n\n"
            + "\n".join(f"- `{p}`" for p in changed_paths)
            + "\n</details>"
        )
        gh.create_issue_comment(pr_number, reply_comment)
        gh.add_comment_reaction(comment_id, "rocket")
        logger.info("Successfully posted reply and added reaction.")
    except Exception as e:
        logger.warning(f"Failed to post final reply comment: {e}")

    logger.info("AntigravityCI completed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
