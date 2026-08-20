<img src="https://ico.hugeicons.com/google-gemini-solid-rounded-512.webp" alt="AntigravityCI Logo" width="120" align="right" />

### 🌌 AntigravityCI

### Autonomous AI PR Assistant · Powered by Google Gemini ♊

[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75FF?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-F1C40F?style=for-the-badge)](LICENSE)

**AntigravityCI** is an autonomous AI pair-programming assistant that lives directly inside your GitHub Pull Requests.

Simply tag `@antigravity refactor`, `fix`, `test`, or `doc` in any PR comment. AntigravityCI will instantly acknowledge receipt (<1.5s), analyze code diffs with Google Gemini, commit hardened improvements to an isolated branch, and open a ready-to-merge Pull Request.

<br clear="right" />

---

## 🎬 How It Works

<img src="Assets/images/demo.gif" width="600" alt="Workflow Demo"/>

<br>

```text
1. Developer comments on a PR:
   @antigravity refactor optimize this async query loop and eliminate redundant DB calls

2. AntigravityCI reacts instantly:
   👍 Reacts +1 to comment in <1.5s
   💬 Replies immediately with instruction replay

3. AntigravityCI executes in the background:
   🧠 Analyzes PR file diffs with Google Gemini (3.6 / 3.7 Flash)
   🌿 Creates dedicated branch: antigravityci/refactor-pr42-a8f9
   📝 Commits refactored code & pushes to origin
   🚀 Opens new Pull Request #43 targeting the base branch
   💬 Posts PR link and change summary to the original thread
```

---

## ✨ Features

- **♊ Google Gemini Powered**: Native integration with Google Gemini 3.6 & 3.7 Flash models with automated multi-model cascade fallbacks for 100% uptime.
- **⚡ 2-Second Execution**: Ultra-fast response times running on Google's high-speed cloud TPUs.
- **💬 Multi-Handle Support**: Supports `@antigravity`, `@AntiGravity`, `@antigravityci`, and `@AntigravityCI` commands.
- **⚡ 2-Job Concurrent Architecture**: Instant acknowledgment (<1.5s) decoupled from the AI code generation pipeline.
- **🛡️ Built-in Security Authorization**: Enforces strict repository permission checks—only authorized collaborators (`OWNER`, `MEMBER`, `COLLABORATOR`) can trigger runs.
- **🚫 Safe Context Filters**: Automatically filters out lockfiles (`package-lock.json`, `poetry.lock`, `Cargo.lock`, etc.), binary assets, and oversized files (>50KB).
- **🌿 Clean Branch Isolation**: Never modifies existing PR branches or commits directly to `main`—always creates a clean, isolated branch and PR for human review.

---

## 🚀 Quick Start (1-Minute Setup)

### 1. Get a Free Google Gemini API Key

Obtain a free API key from [Google AI Studio](https://aistudio.google.com/).

### 2. Add Secrets to your GitHub Repository

Go to **Settings > Secrets and variables > Actions** and add:

- `GEMINI_API_KEY`: Your Google Gemini API Key.

### 3. Enable Workflow Permissions (Important ⚠️)

To allow AntigravityCI to push refactored code and open Pull Requests:

1. Go to **Settings > Actions > General**.
2. Under **Workflow permissions**:
   - Select **Read and write permissions**.
   - Check **Allow GitHub Actions to create and approve pull requests**.
3. Click **Save**.

### 4. Create the Workflow File

Create `.github/workflows/antigravityci.yml` in your repository and paste the following:

```yaml
# Make Sure to set the GEMINI_API_KEY secret in your repository settings for this workflow to function correctly.
name: AntigravityCI

on:
  issue_comment:
    types: [created]

jobs:
  acknowledge:
    name: Instant Acknowledgment
    if: ${{ github.event.issue.pull_request && !endsWith(github.actor, '[bot]') && (contains(github.event.comment.body, 'antigravity') || contains(github.event.comment.body, 'AntiGravity') || contains(github.event.comment.body, 'Antigravity')) }}
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - name: Fast React & Reply
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const { comment, issue } = context.payload;
            if (!comment || !issue) return;

            const allowedRoles = ['OWNER', 'MEMBER', 'COLLABORATOR'];
            if (!allowedRoles.includes(comment.author_association)) return;

            const match = comment.body.trim().match(/@antigravity(?:ci)?\s+([a-zA-Z0-9_-]+)(?:\s+([\s\S]+))?/i);
            if (!match) return;

            const [, cmd, rawInstruction] = match;
            const instruction = (rawInstruction || '').trim();
            const author = comment.user.login;

            await github.rest.reactions.createForIssueComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              comment_id: comment.id,
              content: '+1'
            }).catch(() => {});

            const actionVerb = cmd.toLowerCase().startsWith('refactor') ? 'Refactoring your code' : `Processing \`${cmd}\``;
            const replay = `@antigravityci ${cmd} ${instruction}`.trim();
            const message = `🤖 **AntigravityCI**: ${actionVerb} for @${author}!\n\n> 💬 **Instruction Replay:** \`${replay}\`\n\n⏳ Spawning AI engine and analyzing PR #${issue.number} modified files. I'll open a new PR shortly...`;

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: issue.number,
              body: message
            }).catch(() => {});

  process:
    name: Process AntigravityCI PR Action
    if: ${{ github.event.issue.pull_request && !endsWith(github.actor, '[bot]') && (contains(github.event.comment.body, 'antigravity') || contains(github.event.comment.body, 'AntiGravity') || contains(github.event.comment.body, 'Antigravity')) }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run AntigravityCI
        uses: nivinvysakh/AntigravityCi@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          model: "gemini-3.6-flash"
          post_ack: "false"
```

---

## 💡 Example Commands

Tag AntigravityCI in any Pull Request discussion with any natural instruction:

| Command    | Example Usage                                                    | What AntigravityCI Does                                          |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `refactor` | `@antigravity refactor optimize this async query loop`           | Refactors code for performance, readability, and idiomatic style |
| `fix`      | `@antigravity fix handle edge case when token is expired`        | Identifies bugs, resolves exceptions, and adds edge-case guards  |
| `test`     | `@antigravity test add pytest test cases for auth module`        | Generates comprehensive unit and integration test suites         |
| `doc`      | `@antigravity doc add Google-style docstrings with examples`     | Adds clean type annotations, docstrings, and documentation       |
| `review`   | `@antigravity review check for memory leaks and race conditions` | Audits modified files and implements hardened solutions          |

---

## ⚙️ Action Inputs

| Input              | Description                                                         | Required |        Default        |
| ------------------ | ------------------------------------------------------------------- | :------: | :-------------------: |
| `gemini_api_key`   | Google Gemini API Key from Google AI Studio                         | **Yes**  |           —           |
| `github_token`     | GitHub Token for API operations (`secrets.GITHUB_TOKEN`)            |    No    | `${{ github.token }}` |
| `model`            | Gemini model name (`gemini-3.6-flash`, `gemini-3.7-flash`)          |    No    | `"gemini-3.6-flash"`  |
| `bot_name`         | Comment trigger handle                                              |    No    |  `"@antigravityci"`   |
| `post_ack`         | Whether to post instruction replay (set `"false"` if Job 1 enabled) |    No    |       `"true"`        |
| `max_file_size_kb` | Max individual file size in KB sent to LLM context                  |    No    |         `50`          |
| `target_branch`    | Target branch for generated PR (`auto` uses base of PR)             |    No    |       `"auto"`        |

---

## 🏗️ Architecture Flow

```mermaid
sequenceDiagram
    autonumber
    actor Collaborator as Developer (Collaborator/Owner)
    participant GH as GitHub PR Thread
    participant AckJob as Job 1: Instant Ack (<1.5s)
    participant EngineJob as Job 2: AI Core Engine
    participant Gemini as Google Gemini ♊ (3.6 / 3.7 Flash)

    Collaborator->>GH: Comment: "@antigravity refactor optimize loop"
    par Concurrent Execution
        GH->>AckJob: issue_comment event
        AckJob->>GH: React 👍 (+1) in <1.5s
        AckJob->>GH: Post instant instruction replay comment
    and
        GH->>EngineJob: issue_comment event
        EngineJob->>GH: Fetch modified PR files (excluding lockfiles/binary)
        EngineJob->>Gemini: Send files context + user instruction
        Gemini-->>EngineJob: Return structured file modifications & explanation
        EngineJob->>GH: Git branch & commit refactored files
        EngineJob->>GH: Open new Pull Request targeting base branch
        EngineJob->>GH: Request review & post PR link with 🚀 reaction
    end
```

---

## 🛡️ Security & Safety Model

1. **Role Enforcement**:
   - Only users with `author_association` of `OWNER`, `MEMBER`, or `COLLABORATOR` can invoke AntigravityCI. Comments from unauthorized users are safely ignored.
2. **Context Safety**:
   - Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `poetry.lock`, etc.) are filtered out to prevent context bloat.
   - Binary assets and oversized files (>50KB) are skipped automatically.
3. **Branch Isolation**:
   - AntigravityCI never pushes directly to existing PR branches or protected branches. It always creates a fresh, isolated branch and opens a new Pull Request for human review.

---

## 🧪 Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/nivinvysakh/AntigravityCi.git
   cd AntigravityCi
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run automated tests and build:

   ```bash
   npm test
   npm run build
   ```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
