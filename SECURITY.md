# Security

- EasyScholar keys are local Zotero preferences and are never part of the cache, migration output, logs, tests, or repository.
- The client accepts secret-bearing requests only over HTTPS to `easyscholar.cc` or its subdomains.
- The external migration tool reads publication-rank cache data only. It does not read or migrate preferences, keys, SQLite data, tags, or remarks.
- A key shown in a screenshot or shared log must be rotated before use.
