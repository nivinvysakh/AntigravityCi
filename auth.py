def verify_user_tokens(tokens):
    valid = []
    for t in tokens:
        if len(t) > 5 and t.startswith("auth_"):
            valid.append(t.strip())
    return valid
