<div align="center">

# 🪐 OrbitCI
### Autonomous AI Pull Request Assistant · Powered by Google Gemini ♊

[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75FF?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![Node.js 20](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F1C40F?style=for-the-badge)](LICENSE)

**OrbitCI** is an autonomous AI developer assistant that lives directly inside your GitHub Pull Requests.

Tag `@orbit` in any PR comment to refactor code, resolve bugs, fix failing CI builds, conduct inline reviews, or generate architectural walkthroughs—all delivered in seconds.

</div>

---

## ⚡ How It Works

```text
1. Developer comments on a PR:
   @orbit refactor optimize this async query loop and eliminate redundant DB calls

2. OrbitCI reacts instantly:
   👍 Reacts +1 to comment in <0.2s
   💬 Posts instant instruction replay

3. OrbitCI executes in the background:
   🧠 Analyzes PR file diffs with Google Gemini (3.6 / 3.7 Flash)
   🌿 Creates dedicated branch: orbitci/refactor-pr42-a8f9
   📝 Commits refactored code & pushes to origin
   🚀 Opens new Pull Request #43 targeting the base branch
   💬 Posts PR link, risk scorecard, and change summary
```

---

## ✨ Key Features

- **♊ Google Gemini Cascade**: Native integration with `gemini-3.6-flash`, `gemini-3.7-flash`, and fallback cascades for 100% uptime.
- **⚡ Native Node 20 Runtime**: Instant `<0.1s` VM execution without container startup overhead.
- **🩹 Self-Healing CI (`fix-ci`)**: Reads failed GitHub Actions logs and automatically opens a patch PR fixing broken tests.
- **💬 Inline PR Reviews**: Posts line-by-line code reviews with **one-click GitHub suggestion diff blocks**.
- **🎨 Architecture Diagrams**: Automatically generates and embeds Mermaid diagrams in PR bodies and walkthroughs.
- **📊 AI Quality Scorecard**: Includes automated risk levels, breaking change checks, and file modification metrics.
- **🛡️ Security Enforcement**: Strict role authorization—only `OWNER`, `MEMBER`, or `COLLABORATOR` can trigger runs.
- **🚫 Safe Context Filters**: Filters out lockfiles (`package-lock.json`, `poetry.lock`, `Cargo.lock`), binaries, and oversized files (>50KB).
- **🌿 Clean Branch Isolation**: Never pushes directly to existing PR branches—always creates isolated branches for human review.

---

## 🚀 Quick Start (1-Minute Setup)

### 1. Get a Free Google Gemini API Key
Obtain a free API key from [Google AI Studio](https://aistudio.google.com/).

### 2. Add Secret to your GitHub Repository
Go to **Settings > Secrets and variables > Actions** and add:
- `GEMINI_API_KEY`: Your Google Gemini API Key.

### 3. Enable Workflow Permissions (Important ⚠️)
To allow OrbitCI to push refactored code and open Pull Requests:
1. Go to **Settings > Actions > General**.
2. Under **Workflow permissions**:
   - Select **Read and write permissions**.
   - Check **Allow GitHub Actions to create and approve pull requests**.
3. Click **Save**.

### 4. Create the Workflow File
Create `.github/workflows/orbitci.yml` in your repository:

```yaml
# Make sure to set the GEMINI_API_KEY secret in your repository settings
name: OrbitCI

on:
  issue_comment:
    types: [created]

jobs:
  orbit:
    name: OrbitCI PR Assistant
    if: ${{ github.event.issue.pull_request && !endsWith(github.actor, '[bot]') && (contains(github.event.comment.body, 'orbit') || contains(github.event.comment.body, 'Orbit') || contains(github.event.comment.body, 'antigravity')) }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      workflows: write
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run OrbitCI
        uses: nivinvysakh/OrbitCi@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
```

---

## 💡 Commands & Features

Tag OrbitCI in any Pull Request discussion with any natural instruction or optional inline flags:

| Command | Example Usage | What OrbitCI Does |
|---|---|---|
| `fix-ci` *(or `fixci`)* | `@orbit fix-ci` | **Self-healing CI**: Reads failed GitHub Actions logs & opens a patch PR fixing broken tests |
| `polish-pr` *(or `polish`)* | `@orbit polish-pr enhance title and summary` | **PR Enhancer**: Rewrites PR title to conventional commits & formats rich structured description |
| `review` | `@orbit review check for memory leaks` | **Inline Review**: Posts line-by-line review comments with **one-click GitHub commit suggestions** |
| `explain` | `@orbit explain breakdown architectural tradeoffs` | **Architecture Breakdown**: Posts an ELI5 walkthrough with **auto-generated Mermaid diagrams** |
| `security` *(or `audit`)* | `@orbit security audit for OWASP Top 10 vulnerabilities` | Audits modified files for injection, leaks, and security flaws, creating a hardened patch PR |
| `perf` *(or `optimize`)* | `@orbit perf eliminate redundant allocations and async lag` | Performance-focused profiling and optimization |
| `types` | `@orbit types add strict TypeScript interfaces / type hints` | Adds strict type definitions, annotations, and schemas |
| `changelog` *(or `summarize`)* | `@orbit changelog generate user-facing release notes` | Generates Conventional Changelog release notes |
| `refactor` | `@orbit refactor optimize this async query loop` | Refactors code for performance, readability, and idiomatic style |
| `fix` | `@orbit fix handle edge case when token is expired` | Identifies bugs, resolves exceptions, and adds edge-case guards |
| `test` | `@orbit test add pytest / vitest test cases for auth` | Generates comprehensive unit and integration test suites |
| `doc` | `@orbit doc add Google-style docstrings with examples` | Adds clean type annotations, docstrings, and documentation |

### 🎛️ Inline Command Flags

Customize AI behavior directly in your PR comments:

```text
@orbit perf optimize db queries --model=gemini-3.7-flash --deep
```

- `--model=<name>`: Override default Gemini model (e.g. `gemini-3.7-flash`, `gemini-3.6-flash`).
- `--deep`: Instructs the model to perform deeper multi-step architectural reasoning.

---

## ⚙️ Custom Team Rules (`.orbitci.json`)

You can optionally add a `.orbitci.json` file in your repository root to enforce team conventions:

```json
{
  "rules": [
    "Always use TypeScript strict mode with explicit return types",
    "Prefer immutable data structures and functional programming patterns",
    "Use Vitest for unit testing with comprehensive edge cases"
  ]
}
```

---

## 📊 AI Risk & Quality Scorecard

Every generated Pull Request includes an automated risk evaluation:

- 🛡️ **Risk Level**: `🟢 Low` / `🟡 Medium` / `🔴 High`
- ⚠️ **Breaking Changes**: `✅ None` / `⚠️ Yes`
- 📁 **Files Changed**: Accurate file modification count

---

## ⚙️ Action Inputs

| Input | Description | Required | Default |
|---|---|:---:|:---:|
| `gemini_api_key` | Google Gemini API Key from Google AI Studio | **Yes** | — |
| `github_token` | GitHub Token for API operations (`secrets.GITHUB_TOKEN`) | No | `${{ github.token }}` |
| `model` | Gemini model name (`gemini-3.6-flash`, `gemini-3.7-flash`) | No | `"gemini-3.6-flash"` |
| `bot_name` | Comment trigger handle | No | `"@orbitci"` |
| `post_ack` | Whether to post instruction replay in thread | No | `"true"` |
| `max_file_size_kb` | Max individual file size in KB sent to LLM context | No | `50` |
| `target_branch` | Target branch for generated PR (`auto` uses base of PR) | No | `"auto"` |

---

## 🏗️ Architecture Flow

```mermaid
sequenceDiagram
    autonumber
    actor Collaborator as Developer (Collaborator/Owner)
    participant GH as GitHub PR Thread
    participant Action as OrbitCI Action
    participant Gemini as Google Gemini ♊ (3.6 / 3.7 Flash)

    Collaborator->>GH: Comment: "@orbit refactor optimize loop"
    GH->>Action: issue_comment event
    Action->>GH: React 👍 (+1) & post instruction replay (<1s)
    Action->>GH: Fetch modified PR files (excluding lockfiles/binary)
    Action->>Gemini: Send files context + user instruction
    Gemini-->>Action: Return structured file modifications & explanation
    Action->>GH: Git branch & commit refactored files
    Action->>GH: Open new Pull Request targeting base branch
    Action->>GH: Request review & post PR link with 🚀 reaction
```

---

## 🛡️ Security & Safety Model

1. **Role Enforcement**: Only users with `author_association` of `OWNER`, `MEMBER`, or `COLLABORATOR` can invoke OrbitCI. Comments from unauthorized users are safely ignored.
2. **Context Safety**: Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `poetry.lock`, etc.), binary assets, and oversized files (>50KB) are skipped automatically.
3. **Branch Isolation**: OrbitCI never pushes directly to existing PR branches or protected branches. It always creates a fresh, isolated branch and opens a new Pull Request for human review.

---

## 🧪 Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/nivinvysakh/OrbitCi.git
   cd OrbitCi
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

## ⚖️ Disclaimer

**OrbitCI** is an independent open-source community project and is not officially affiliated with, endorsed by, sponsored by, or associated with Google LLC, Alphabet Inc., or the Google Gemini project.

*Google*, *Google Gemini*, and related marks, logos, and brands are trademarks or registered trademarks of Google LLC. All other product names, logos, and brands mentioned are property of their respective owners.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
