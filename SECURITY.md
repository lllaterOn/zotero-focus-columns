# Security

Focus Columns is maintained in a private repository. Report security issues privately to the repository owner and do not place credentials or private Zotero data in an issue, pull request, screenshot, or log.

- EasyScholar keys are local Zotero preferences and are excluded from caches, synchronized settings, backups, tests, logs, packages, and Git.
- Secret-bearing requests must use HTTPS on `easyscholar.cc` or its subdomains.
- Synchronization notes contain no device identifier or local connection state.
- The release package is checked for common credential formats and machine-specific paths.
- A key, token, cookie, or authorization code exposed outside its intended authentication flow must be revoked or rotated.
