# Security Policy

## 🔒 Supported Versions

We actively provide security patches and updates for the following versions of **AntigravityCi**:

| Version | Supported          |
| ------- | ------------------ |
| `v1.x`  | :white_check_mark: |
| `< 1.0` | :x:                |

---

## 🛡️ Security Architecture & Best Practices

AntigravityCi executes code modifications and interacts with external LLM APIs inside your GitHub Actions environment. To ensure safe operation:

1. **Role-Based Access Control (RBAC):** By default, AntigravityCi restricts execution to repository `OWNER`, `MEMBER`, and `COLLABORATOR` roles to prevent unauthorized fork contributors from draining API tokens.
2. **Secret Isolation:** Never hardcode your `GEMINI_API_KEY` in workflow files. Always store it inside **Repository Secrets** or **Organization Secrets**.
3. **Token Scoping:** Ensure the `GITHUB_TOKEN` provided to AntigravityCi only has the minimum permissions required (`contents: write`, `pull-requests: write`, `issues: write`).

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability (such as prompt injection vectors, secret exposure in action logs, or token leakage):

1. **Do NOT open a public issue or comment on a pull request.**
2. Report the vulnerability privately using [GitHub Private Vulnerability Reporting](https://github.com/nivinvysakh/AntigravityCi/security/advisories/new).
3. If private advisories are unavailable, contact the maintainer directly via your preferred private channel.

### What to Include in Your Report

- A clear description of the vulnerability.
- Step-by-step reproduction steps or a minimal proof-of-concept (PoC).
- Any potential impact on user repositories or secrets.

---

## ⏱️ Response & Disclosure Timeline

- **Initial Response:** Within 48 hours of receiving the report.
- **Triage & Patch:** We aim to release a patched version within 7 business days for critical issues.
- **Public Disclosure:** Coordinated after a fix has been released and users have had sufficient time to update to the latest action tag (`@v1`).
