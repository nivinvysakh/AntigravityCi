from __future__ import annotations


def verify_user_tokens(tokens: list[str]) -> list[str]:
    """Verify and clean list of user tokens."""
    return [t.strip() for t in tokens if len(t) > 5 and t.startswith("auth_")]
