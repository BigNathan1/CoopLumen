# Security Policy

## Supported Versions

| Version         | Supported |
| --------------- | --------- |
| `main` (latest) | ✅        |
| Older tags      | ❌        |

We only provide security fixes for the latest code on `main`. If you are running an older version, please upgrade before reporting.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing **security@cooplumen.org** with:

- A description of the vulnerability
- Steps to reproduce (proof-of-concept if possible)
- The potential impact
- Any suggested mitigations

### What to expect

| Timeline                  | Action                                      |
| ------------------------- | ------------------------------------------- |
| **24 hours**              | Acknowledgement of your report              |
| **72 hours**              | Initial assessment and severity rating      |
| **14 days**               | Target for a patch (critical/high severity) |
| **After fix is deployed** | Public disclosure coordinated with you      |

We follow responsible disclosure. We will credit reporters in the release notes unless you prefer anonymity.

## Scope

The following are **in scope**:

- Authentication and authorisation bypass
- SQL injection or query manipulation
- Stellar transaction signing vulnerabilities
- Private key exposure (server-side or in logs)
- XSS, CSRF, or CSP bypass in the frontend
- Dependency vulnerabilities with a known exploit path

The following are **out of scope**:

- Issues in third-party services (Horizon API, Freighter wallet)
- Theoretical vulnerabilities without a realistic attack vector
- Social engineering or phishing attacks
- Denial-of-service via resource exhaustion on testnet

## Security Best Practices for Contributors

- Never log private keys, JWT secrets, or passwords
- Use parameterised queries — no raw SQL string concatenation
- Validate all user input at the API boundary
- Keep dependencies up to date (`npm audit` runs in CI)
- Follow the principle of least privilege in all new endpoints
