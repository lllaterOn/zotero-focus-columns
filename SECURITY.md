# Security

Report security vulnerabilities through this repository's private vulnerability-reporting form under **Security → Advisories → Report a vulnerability**. Do not disclose an unpatched vulnerability, credential, or private Zotero data in a public issue, pull request, screenshot, or log.

The latest release line receives security fixes. Unsupported historical releases may remain available only for traceability.

- EasyScholar keys are local Zotero preferences and are excluded from caches, synchronized settings, backups, tests, logs, packages, and Git.
- Secret-bearing requests must use HTTPS on `easyscholar.cc` or its subdomains.
- Synchronization notes contain no device identifier or local connection state.
- The release package is checked for common credential formats and machine-specific paths.
- A key, token, cookie, or authorization code exposed outside its intended authentication flow must be revoked or rotated.
- Release and update URLs are public HTTPS URLs and never contain authentication material.
