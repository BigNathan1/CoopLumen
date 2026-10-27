# Security Policy

## Supported Versions

| Version         | Supported |
| --------------- | --------- |
| `main` (latest) | Yes       |
| Older tags      | No        |

We only provide security fixes for the latest code on `main`. If you are running an older version, please upgrade before reporting.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/BigNathan1/CoopLumen/security/advisories/new)). Include:

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

## How the repository is protected

- Every change reaches `main` through a pull request that passes CI and is approved by a code owner.
- CodeQL scans the code, and Dependency review blocks pull requests that add a dependency with a high-severity advisory or a malware flag.
- Dependabot raises alerts and opens security fixes for vulnerable dependencies.
- Secret scanning with push protection rejects pushes that contain credentials.
- GitHub Actions are pinned to commit SHAs, and workflows run with read-only tokens unless a job needs more.

## Security Best Practices for Contributors

- Never log private keys, JWT secrets, or passwords
- Use parameterised queries — no raw SQL string concatenation
- Validate all user input at the API boundary
- Keep dependencies up to date (`npm audit` runs in CI)
- Never change a workflow, Dockerfile or package manifest without saying why in the pull request
- Follow the principle of least privilege in all new endpoints
