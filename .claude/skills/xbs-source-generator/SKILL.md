---
name: xbs-source-generator
description: Generate and verify Xiangse Guige (XBS) book-source rules from a real novel website. Use when an agent must visit a site, handle Cloudflare JS Challenge or Turnstile, search a test book, inspect detail/chapter/content pages, derive XPath rules, validate selectors against captured HTML, and return importable XBS source JSON.
---

# XBS Source Generator

Generate rules from runtime evidence, not from guessed site conventions.

## Required workflow

1. Run the exact collection command supplied in the task prompt. Do not replace it with `curl`, `WebFetch`, or a direct HTTP client. The collector owns the persistent browser profile, Cloudflare challenge handling, navigation, and evidence capture.
2. Read the generated `evidence.json`. Read the referenced page snapshots only when their role is relevant.
3. Read [references/xbs-rules.md](references/xbs-rules.md) before constructing the result. Read [references/cloudflare.md](references/cloudflare.md) if collection reports a challenge or failure.
4. Establish one proven chain: search request -> search result -> detail -> chapter list -> chapter content. Missing stages must be reported; do not invent them.
   - If the site's own search returns an empty shell or stale links, the collector may use its recorded external discovery fallback to locate an exact same-origin detail page. This is discovery evidence only; never emit the external search URL as `searchBook.requestInfo`.
5. Derive XPath relative to each list item where appropriate. Prefer stable semantic attributes and structure over generated class names or numeric positions.
6. Run the inspector command for every decisive XPath:

   ```bash
   node .claude/skills/xbs-source-generator/scripts/collect-site.mjs inspect --evidence <evidence.json> --role <search|detail|chapters|content> --xpath '<xpath>'
   ```

   Verify at minimum `searchBook.list`, `searchBook.detailUrl`, `chapterList.list`, `chapterList.url`, and `chapterContent.content`. Verify detail fields that are emitted.
7. Return the requested structured output. Put only one JSON object in `source_json`. Include concrete evidence URLs, selector check results, and unresolved limitations.

## Decision rules

- Treat browser-rendered state and captured final URLs as authoritative.
- Use the successful search method recorded by the collector. Never infer a POST body or query key from a generic route name.
- Distinguish `search.successful` from `search.external_discovery`. Only a target-site URL/form may become `searchBook.requestInfo`; external discovery can prove a detail page but cannot replace a missing target-site search rule.
- Use XPath only for DOM parser fields.
- Resolve relative `detailUrl`, chapter `url`, and image URLs with an XBS `||@js:` suffix based on `params.responseUrl` when the app will not resolve them itself.
- Put content cleanup in `chapterContent.content` using `|@js:`. Never emit a `filter` field.
- Emit optional `bookWorld`, shudan, shuping, or related-word rules only when captured evidence proves their list structure.
- Preserve `status` and `lastChapterTitle`; do not use `state` or `lastChapter`.
- Keep `httpHeaders` empty unless the browser evidence proves a required stable header. Never copy clearance cookies or challenge tokens into a book source.
- A Cloudflare clearance cookie belongs to the collector profile, not the generated XBS JSON.

## Failure handling

- If collection reports `challenge_detected=true` and `challenge_cleared=false`, stop selector generation and report the exact failure.
- If search is missing, still inspect the homepage for a real form, but do not synthesize a search rule.
- If the target site's search page does not contain the externally discovered exact book, report that selector coverage limitation rather than claiming the test title was returned by native search.
- If detail and chapter pages are the same URL, use the same captured page for both roles and verify each XPath independently.
- If the first chapter is paginated, record this as a limitation unless the next-page behavior was captured and verified.

## Resources

- [references/xbs-rules.md](references/xbs-rules.md): output schema, XPath and XBS pipeline rules.
- [references/extraction.md](references/extraction.md): page-role and selector heuristics.
- [references/cloudflare.md](references/cloudflare.md): challenge behavior and troubleshooting.
- `scripts/collect-site.mjs`: browser collection plus offline XPath inspection.
- `scripts/cloudflare-browser.mjs`: persistent Chrome launch, challenge detection/waiting, Turnstile CDP clicking, and clearance verification.
- `assets/cf-turnstile-patcher/`: bundled Chrome extension for CDP `screenX/screenY` correction and Shadow DOM checkbox geometry.
