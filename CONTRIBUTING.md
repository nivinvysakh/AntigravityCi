# Contributing to AntigravityCI

Thank you for your interest in contributing to **AntigravityCI**—an autonomous AI Pull Request assistant powered by Google Gemini! We welcome contributions from developers, researchers, and enthusiasts who want to improve AI-driven code review and automation.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Standards](#code-standards)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)
- [Security & Authorization](#security--authorization)

---

## Code of Conduct

Please review our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing. We are committed to providing a welcoming and inclusive environment for all contributors.

---

## How to Contribute

### 🐛 Bug Reports & Feature Requests

- **Found a bug?** Open an [Issue](https://github.com/nivin/antigravity/issues) with:
  - Clear description of the problem
  - Steps to reproduce
  - Expected vs. actual behavior
  - Python version and environment details

- **Have a feature idea?** Open a [Discussion](https://github.com/nivin/antigravity/discussions) or [Issue](https://github.com/nivin/antigravity/issues) labeled `enhancement` with:
  - Clear use case and motivation
  - Proposed implementation approach (if applicable)
  - Example workflow

### 📚 Documentation Improvements

- Fix typos or clarify existing docs
- Add examples, guides, or troubleshooting sections
- Improve README, docstrings, or API documentation

### 💻 Code Contributions

- Performance optimizations
- Bug fixes with test coverage
- New features aligned with the project roadmap
- Refactoring for code quality

---

## Development Setup

### Prerequisites

- **Python 3.11+** (verified with Ruff configuration)
- **Google Gemini API Key** ([Get one free](https://aistudio.google.com/))
- **Git** and a GitHub account

### 1. Clone the Repository

```bash
git clone https://github.com/nivin/antigravity.git
cd antigravity
```

### 2. Create a Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install Development Dependencies

```bash
pip install -r requirements.txt
pip install pytest pytest-cov ruff
```

### 4. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_api_key_here
```

Or export as an environment variable:

```bash
export GEMINI_API_KEY=your_api_key_here
```

---

## Running Tests

### Run All Tests

```bash
pytest tests/ -v
```

### Run with Coverage Report

```bash
pytest tests/ --cov=. --cov-report=html
```

### Run a Specific Test

```bash
pytest tests/test_main.py::test_function_name -v
```

### Lint Code with Ruff

```bash
ruff check .
ruff format .
```

---

## Code Standards

### Python Style Guide

- **Target Version:** Python 3.11+
- **Line Length:** 120 characters (per `pyproject.toml`)
- **Linter:** Ruff (E, F, W rules enabled)

### Code Quality Checklist

- ✅ All tests pass locally: `pytest tests/ -v`
- ✅ Code is formatted: `ruff format .`
- ✅ No linting issues: `ruff check .`
- ✅ Type hints are used where applicable
- ✅ Docstrings follow the project's convention
- ✅ New features include corresponding tests

### Type Hints

Use type hints for function parameters and return values:

```python
def process_pr_diff(diff: str, instruction: str) -> dict[str, Any]:
    """Process a PR diff using Google Gemini."""
    pass
```

### Docstrings

Follow Google-style docstrings:

```python
def authorize_user(author_association: str) -> bool:
    """Check if user has permission to trigger AntigravityCI.

    Args:
        author_association: GitHub author role (OWNER, MEMBER, COLLABORATOR).

    Returns:
        True if authorized, False otherwise.
    """
    pass
```

---

## Submitting a Pull Request

### 1. Fork and Branch

```bash
git fork  # (or use GitHub UI)
git checkout -b feature/your-feature-name
```

Use descriptive branch names:

- `fix/auth-bypass-issue`
- `feature/gemini-3.8-support`
- `docs/improve-setup-guide`

### 2. Make Your Changes

- Keep commits atomic and well-documented
- Write clear commit messages (e.g., `Fix: prevent unauthorized users from triggering runs`)
- Reference related issues: `Fixes #123`

### 3. Test Thoroughly

```bash
pytest tests/ -v
ruff check . && ruff format .
```

### 4. Push and Create a PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:

- **Title:** Clear, concise description of changes
- **Description:** Explain what, why, and how
- **Reference Issues:** Link to any related issues
- **Testing:** Describe tests added/updated

### 5. Review Process

- Address reviewer feedback promptly
- Keep commits clean (avoid "fix typo" commits in reviews)
- Maintainers will merge when approved

---

## Reporting Issues

### Security Issues ⚠️

**Do NOT open public issues for security vulnerabilities.** Email security concerns directly to the maintainers at [admin email or security policy].

### Bug Reports

Provide:

1. **Title:** Bug: [Clear description]
2. **Environment:** Python version, OS, dependencies
3. **Steps to Reproduce:** Exact sequence to trigger the bug
4. **Expected vs. Actual:** What should happen vs. what happened
5. **Error Logs:** Full traceback or logs
6. **Screenshots/Recordings:** If applicable (especially for UI-related bugs)

### Feature Requests

Describe:

1. **Use Case:** Why this feature is needed
2. **Proposed Solution:** How it should work
3. **Alternative Approaches:** Any other solutions considered
4. **Additional Context:** References, examples, mockups

---

## Security & Authorization

### Key Security Principles

AntigravityCI enforces strict authorization checks:

- **Allowed Roles:** Only `OWNER`, `MEMBER`, or `COLLABORATOR` can trigger runs
- **File Filtering:** Lockfiles, binary assets, and files >50KB are automatically excluded
- **Branch Isolation:** Never modifies existing PR branches; always creates clean, isolated branches
- **Safe Context:** Filters `.package-lock.json`, `poetry.lock`, `Cargo.lock`, etc.

### Contributing Security-Related Code

When contributing security features or fixes:

1. Discuss the change in a private security issue first (if possible)
2. Provide test cases demonstrating the vulnerability
3. Ensure backward compatibility and no breaking changes
4. Follow the principle of least privilege

---

## Questions or Need Help?

- **Discussion:** Use [GitHub Discussions](https://github.com/nivin/antigravity/discussions)
- **Issues:** Open an [Issue](https://github.com/nivin/antigravity/issues)
- **Email:** Reach out to the maintainers

---

## Recognition

We appreciate all contributions! Contributors will be recognized in:

- README.md (major contributions)
- GitHub Insights (all contributors)
- Release notes (feature contributions)

---

**Thank you for making AntigravityCI better!** 🚀✨
