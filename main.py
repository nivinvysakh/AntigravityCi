#!/usr/bin/env python3
"""
AntigravityCI - AI Pull Request Assistant.
Powered by embedded local Qwen2.5-Coder (zero API keys needed) with automatic
cloud fallback to Google Gemini / Groq / OpenAI.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import requests
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("antigravityci")

# Security: Allowed GitHub author associations
AUTHORIZED_ROLES: set[str] = {"OWNER", "MEMBER", "COLLABORATOR"}

# Safety: Extensions to treat as binary
BINARY_EXTENSIONS: set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
    ".pdf", ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".exe", ".bin",
    ".dll", ".so", ".dylib", ".woff", ".woff2", ".eot", ".ttf", ".otf",
    ".pyc", ".pyo", ".pyd", ".class", ".jar", ".war", ".mp3", ".mp4", ".mov",
    ".avi", ".flv", ".wav", ".db", ".sqlite", ".sqlite3"
}

# Safety: Lockfiles and generated files to ignore (all lowercase)
LOCKFILES: set[str] = {
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

# Gemini fallback cascade list (using latest available models)
GEMINI_CASCADE_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-2.0-flash-exp",
]


# ============================================================================
# Pydantic Schemas for Structured Output
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
    modified_files: list[FileModification] = Field(description="List of files to modify, create, or delete.")


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

    def get_pull_request(self, pr_number: int) -> dict[str, Any]:
        """Fetch Pull Request details."""
        url = f"{self.base_url}/pulls/{pr_number}"
        resp = self.session.get(url)
        resp.raise_for_status()
        return resp.json()

    def get_pr_files(self, pr_number: int) -> list[dict[str, Any]]:
        """Fetch all files modified in the Pull Request with pagination."""
        files: list[dict[str, Any]] = []
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

    def get_file_content(self, path: str, ref: str) -> Optional[str]:
        """Fetch raw file content from GitHub API if not available locally."""
        url = f"{self.base_url}/contents/{path}?ref={ref}"
        try:
            resp = self.session.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("encoding") == "base64" and "content" in data:
                    return base64.b64decode(data["content"]).decode("utf-8")
        except Exception as e:
            logger.warning(f"Failed to fetch content for {path} at {ref} from GitHub API: {e}")
        return None

    def add_comment_reaction(self, comment_id: int, reaction: str = "+1") -> bool:
        """Add emoji reaction to an issue/PR comment."""
        url = f"{self.base_url}/issues/comments/{comment_id}/reactions"
        resp = self.session.post(url, json={"content": reaction})
        if resp.status_code in (200, 201):
            logger.info(f"Reacted '{reaction}' to comment {comment_id}")
            return True
        logger.warning(f"Failed to react to comment {comment_id}: {resp.status_code} {resp.text}")
        return False

    def create_issue_comment(self, issue_number: int, body: str) -> Optional[dict[str, Any]]:
        """Post a comment on a PR / Issue."""
        url = f"{self.base_url}/issues/{issue_number}/comments"
        resp = self.session.post(url, json={"body": body})
        if resp.status_code in (200, 201):
            return resp.json()
        logger.error(f"Failed to create comment on issue {issue_number}: {resp.status_code} {resp.text}")
        return None

    def create_pull_request(
        self, title: str, body: str, head: str, base: str
    ) -> dict[str, Any]:
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

def run_cmd(cmd: list[str], check: bool = True, cwd: Optional[str] = None) -> subprocess.CompletedProcess:
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


def is_safe_text_file(filename: str, size_bytes: int = 0, max_file_size_kb: int = 50) -> tuple[bool, str]:
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

    # 3. Oversized check (if size is known)
    if size_bytes > 0:
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
# LLM Execution: Local (Qwen2.5-Coder) & Cloud (Gemini / OpenAI / Groq)
# ============================================================================

def call_local_llama_server(
    prompt: str,
    system_instruction: str,
    base_url: str = "http://127.0.0.1:8080",
) -> GeminiPRResponse:
    """Call the embedded local llama-server running Qwen2.5-Coder."""
    url = f"{base_url}/v1/chat/completions"
    schema_prompt = (
        f"{system_instruction}\n\n"
        "CRITICAL: You MUST respond ONLY with a valid JSON object matching this schema:\n"
        "{\n"
        '  "summary": "Brief summary",\n'
        '  "explanation": "Markdown explanation",\n'
        '  "pr_title": "Conventional commit title",\n'
        '  "pr_body": "Detailed PR body",\n'
        '  "modified_files": [\n'
        '    {"path": "relative/path.ext", "action": "modify", "content": "full updated code"}\n'
        "  ]\n"
        "}"
    )

    payload = {
        "messages": [
            {"role": "system", "content": schema_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }

    logger.info(f"Querying embedded local LLM server at {url}...")
    resp = requests.post(url, json=payload, timeout=300)
    resp.raise_for_status()
    res_json = resp.json()
    content = res_json["choices"][0]["message"]["content"]

    # Clean markdown json tags if present
    content = re.sub(r"^```(?:json)?\s*", "", content.strip())
    content = re.sub(r"\s*```$", "", content)
    data = json.loads(content)
    return GeminiPRResponse(**data)


def call_gemini_cascade(
    gemini_api_key: str,
    requested_model: str,
    prompt: str,
    system_instruction: str,
) -> tuple[GeminiPRResponse, str]:
    """Call Google Gemini with automatic fallback cascade if 503 / rate limits occur."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=gemini_api_key)
    models_to_try = [requested_model] + [m for m in GEMINI_CASCADE_MODELS if m != requested_model]
    last_error: Optional[Exception] = None

    for model in models_to_try:
        try:
            logger.info(f"Attempting Gemini ({model})...")
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
            if response.text:
                data = json.loads(response.text)
                return GeminiPRResponse(**data), model
        except Exception as e:
            last_error = e
            logger.warning(f"Gemini model {model} failed: {e}. Cascading to next model...")

    raise RuntimeError(f"All Gemini cascade models failed: {last_error}")


def call_ai_engine(
    engine: str,
    gemini_api_key: Optional[str],
    model_name: str,
    prompt: str,
    system_instruction: str,
) -> tuple[GeminiPRResponse, str]:
    """Unified AI dispatcher supporting Local Qwen2.5-Coder and Cloud fallback."""
    # 1. Force Local Engine
    if engine == "local" or not gemini_api_key:
        try:
            res = call_local_llama_server(prompt, system_instruction)
            return res, "local-qwen2.5-coder-1.5b"
        except Exception as local_err:
            if not gemini_api_key:
                raise RuntimeError(f"Local LLM engine failed and no GEMINI_API_KEY provided: {local_err}")
            logger.warning(f"Local LLM failed ({local_err}), falling back to cloud Gemini...")

    # 2. Cloud Gemini with Fallback Cascade
    if gemini_api_key:
        try:
            return call_gemini_cascade(gemini_api_key, model_name, prompt, system_instruction)
        except Exception as gemini_err:
            logger.warning(f"Gemini cloud failed: {gemini_err}. Attempting local engine fallback...")
            try:
                res = call_local_llama_server(prompt, system_instruction)
                return res, "local-qwen2.5-coder-1.5b (fallback)"
            except Exception as e:
                raise RuntimeError(f"Both Cloud Gemini and Local LLM failed: {gemini_err} | {e}")

    raise RuntimeError("No valid AI engine available.")


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
    engine = os.getenv("INPUT_ENGINE", "auto").lower()
    model_name = os.getenv("INPUT_MODEL", "gemini-3.6-flash")
    bot_name = os.getenv("INPUT_BOT_NAME", "@antigravityci")
    max_file_size_kb = int(os.getenv("INPUT_MAX_FILE_SIZE_KB", "50"))
    target_branch_input = os.getenv("INPUT_TARGET_BRANCH", "auto")

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
        engine_label = "Local Qwen2.5-Coder" if (engine == "local" or not gemini_api_key) else f"Cloud ({model_name})"
        ack_message = (
            f"🤖 **AntigravityCI**: {action_verb} for @{comment_author}!\n\n"
            f"> 💬 **Instruction Replay:** `{replay_text}`\n\n"
            f"⏳ Analyzing PR #{pr_number} modified files with {engine_label}. I'll create a branch and open a new PR shortly..."
        )
        gh.create_issue_comment(pr_number, ack_message)
    except Exception as e:
        logger.warning(f"Could not post initial acknowledgment message: {e}")

    # 2. Fetch PR details and modified files
    try:
        pr_info = gh.get_pull_request(pr_number)
        base_branch = pr_info.get("base", {}).get("ref", "main")
        head_branch = pr_info.get("head", {}).get("ref", "head")
        head_sha = pr_info.get("head", {}).get("sha", "")
        pr_title = pr_info.get("title", f"PR #{pr_number}")
        pr_author = pr_info.get("user", {}).get("login", "unknown")
        target_branch = base_branch if target_branch_input == "auto" else target_branch_input

        pr_files_raw = gh.get_pr_files(pr_number)
    except Exception as e:
        logger.error(f"Failed to fetch PR info or files: {e}")
        gh.create_issue_comment(
            pr_number,
            f"⚠️ **AntigravityCI Error**: Unable to fetch PR #{pr_number} metadata or files.\n```\n{e}\n```"
        )
        return 1

    # Fetch and checkout PR branch so workspace has the modified PR files locally
    try:
        run_cmd(["git", "fetch", "origin", f"pull/{pr_number}/head:pr-{pr_number}"])
        run_cmd(["git", "checkout", f"pr-{pr_number}"])
        logger.info(f"Checked out PR #{pr_number} branch locally.")
    except Exception as e:
        logger.warning(f"Could not checkout PR branch via Git: {e}. Falling back to GitHub API for file contents.")

    # 3. Filter files and collect context
    files_context: list[dict[str, str]] = []
    ignored_files_log: list[str] = []

    for f_meta in pr_files_raw:
        filename = f_meta.get("filename")
        status = f_meta.get("status")

        if status == "removed":
            continue

        safe, reason = is_safe_text_file(filename, 0, max_file_size_kb)
        if not safe:
            ignored_files_log.append(f"`{filename}` ({reason})")
            continue

        content = read_file_safely(filename, max_file_size_kb)
        if content is None:
            content = gh.get_file_content(filename, head_sha)

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
            msg += "\n\n**Ignored Files:**\n- " + "\n- ".join(ignored_files_log)
        gh.create_issue_comment(pr_number, msg)
        return 0

    # 4. Construct prompt for AI Engine
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

    # 5. Call AI Engine (Local Qwen2.5-Coder or Cloud with Fallback Cascade)
    try:
        ai_response, engine_used = call_ai_engine(
            engine=engine,
            gemini_api_key=gemini_api_key,
            model_name=model_name,
            prompt=user_prompt,
            system_instruction=system_instruction,
        )
        logger.info(f"AI response generated successfully using: {engine_used}")
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        gh.create_issue_comment(
            pr_number,
            f"❌ **AntigravityCI Error**: AI generation failed.\n```\n{e}\n```"
        )
        return 1

    if not ai_response.modified_files:
        gh.create_issue_comment(
            pr_number,
            f"ℹ️ **AntigravityCI**: Analyzed PR #{pr_number} but determined no file modifications were necessary.\n\n"
            f"**Explanation:**\n{ai_response.explanation}"
        )
        return 0

    # 6. Create Git branch and commit changes
    short_id = uuid.uuid4().hex[:6]
    clean_cmd = re.sub(r"[^a-zA-Z0-9_-]", "-", parsed.command).lower()
    new_branch_name = f"antigravityci/{clean_cmd}-pr{pr_number}-{short_id}"

    try:
        setup_git_user()

        # Checkout and create new branch from the current PR checkout
        run_cmd(["git", "checkout", "-b", new_branch_name])

        # Write files
        changed_paths: list[str] = []
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
            f"Engine: {engine_used}\n"
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
            + f"\n\n---\n*Generated with 🧠 [{engine_used}](https://github.com/{github_repository}) via AntigravityCI.*"
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
            f"**Engine Used:** `{engine_used}`\n\n"
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
