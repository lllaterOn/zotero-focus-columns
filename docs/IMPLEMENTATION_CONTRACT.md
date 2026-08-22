# Implementation Contract

The authoritative product contract is [`../../../CUSTOMIZATION_CHECKLIST.md`](../../../CUSTOMIZATION_CHECKLIST.md). This repository implements only that scope.

Technical invariants:

1. Every Zotero API registration is retained by returned ID and explicitly unregistered on toggle or shutdown.
2. Publication render callbacks perform synchronous cache reads only. Network work starts from a deduplicated background queue after visible rendering.
3. A secret-bearing request is sent only with native `fetch` to a validated EasyScholar HTTPS URL. The Zotero HTTP wrapper is intentionally not used because it logs request URLs.
4. Remarks have no private database. `Extra` is rewritten only through the tested `remark:` line transformer.
5. Status and `#` tags remain Zotero native tags.
6. Migration runs outside Zotero and never changes the source cache.
