# Security — Project

> Last updated: 2026-03-20
> The agent must read this before touching authentication, secrets, or external APIs.

## Secrets Management

- **Never** hardcode API keys, tokens, passwords, or credentials
- All secrets go in environment variables (e.g. `.env`, not committed)
- Add secret variable names to `.env.example` with placeholder values
- Document required secrets here:

| Variable | Purpose | Where to get it |
|----------|---------|----------------|
| (add rows) | | |

## Authentication & Authorisation

- [Describe the auth mechanism used: JWT, sessions, OAuth, etc.]
- [List which endpoints/routes require authentication]
- [Describe role/permission model if applicable]

## Input Validation

- Validate and sanitize ALL user inputs before processing
- [List specific validation rules for critical inputs]

## CORS & Headers

- [Describe CORS configuration and allowed origins]
- [List security headers in use: CSP, X-Frame-Options, etc.]

## Checkpoints Required

The agent must stop and ask before:
- Changing authentication logic
- Adding new public endpoints
- Modifying CORS configuration
- Changing how secrets are loaded or used

## Known Vulnerabilities to Avoid

- SQL/NoSQL injection → use parameterised queries
- XSS → sanitise all output
- Path traversal → validate file paths
- Command injection → never execute shell commands with user input

---

*Update when security requirements change.*
