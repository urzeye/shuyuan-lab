---
name: xbs-source-generator
description: Generate and verify Xiangse Guige (XBS) book-source rules from a real novel website. Use when an agent must visit a site, handle Cloudflare JS Challenge or Turnstile, search a test book, inspect detail/chapter/content pages, derive XPath rules, validate selectors against captured HTML, and return importable XBS source JSON.
---

# XBS Source Generator

Generate rules from runtime evidence, not from guessed site conventions.

## Required workflow

1. Run the exact collection command supplied in the task prompt. Do not replace it with `curl`, `WebFetch`, or a direct HTTP client. The collector owns the persistent browser profile, Cloudflare challenge handling, navigation, and evidence capture.
2. Read the generated `evidence.json`. Read the referenced page snapshots only when their role is relevant.
3. Read [references/xbs-rules.md](references/xbs-rules.md) and [references/extraction.md](references/extraction.md) before constructing the result. Read [references/cloudflare.md](references/cloudflare.md) if collection reports a challenge or failure.
4. Establish one proven chain: search request -> search result -> detail -> chapter list -> chapter content. Missing stages must be reported; do not invent them.
   - If the site's own search returns an empty shell or stale links, the collector may use its recorded external discovery fallback to locate an exact same-origin detail page. This is discovery evidence only; never emit the external search URL as `searchBook.requestInfo`.
5. Derive XPath relative to each list item where appropriate. Prefer stable semantic attributes and structure over generated class names or numeric positions.
6. Run the inspector for every decisive XPath. Prefer one batched call over many single calls; it launches the browser once and its output already matches the `selector_checks` schema (`rule`/`role`/`xpath`/`count`/`sample`):

   ```bash
   node .claude/skills/xbs-source-generator/scripts/collect-site.mjs inspect --evidence <evidence.json> --checks-json '[{"rule":"searchBook.list","role":"search","xpath":"//div[@class=\"result\"]/ul/li"},{"rule":"searchBook.bookName","role":"search","xpath":".//h3/a","contextXpath":"//div[@class=\"result\"]/ul/li"}]'
   ```

   Verify at minimum `searchBook.list`, `searchBook.detailUrl`, `chapterList.list`, `chapterList.url`, and `chapterContent.content`. Verify detail fields that are emitted. For fields relative to a list item, set `contextXpath` to the list selector so the child XPath is evaluated per list node; a document-wide count proves nothing for child fields.
   - `||`, `||@js:`, `|@js:`, and `|@replace:` are XBS rule syntax, not XPath. Never pass them to the inspector. Inspect each `||` alternative's plain XPath as a separate check.
   - A check whose role was not captured returns `count: 0` with an `error`; treat it as missing evidence, not as a wrong selector. A `count: 0` on a truncated snapshot (see the page's `snapshot_truncated`) may also be a truncation artifact.
7. Write the `source_json` as a standalone JSON file next to `evidence.json`, named `{sourceName}.json` (replace characters `\ / : * ? " < > |` with empty string). Then convert it to XBS:

   ```bash
   node .claude/skills/xbs-source-generator/scripts/xbs-encode.mjs <taskDir>/<sourceName>.json <taskDir>/<sourceName>.xbs
   ```

8. Return the requested structured output. Put only one JSON object in `source_json`. Include concrete evidence URLs, selector check results, and unresolved limitations.

## Decision rules

- Treat browser-rendered state and captured final URLs as authoritative.
- Use the successful search method recorded by the collector. Never infer a POST body or query key from a generic route name.
- **Validate that the search response actually contains search results.** A page that returns the same content as the homepage regardless of the search term is NOT a working search endpoint. Evidence rule: the captured page title, text content, or book links must differ across two different search terms, and the test book title must appear in the result list. A homepage that happens to list one matching book among its static rankings is not a search result. Use `search.control_probe` for the differential check: if `contains_test_book` or `same_text_as_book_search` is true, the endpoint is a fake search and must not become `searchBook.requestInfo`.
- When `search.successful.encoding` is `form-native`, the browser negotiated the page encoding (common on legacy GBK sites). A URL-template `requestInfo` would send the keyword as UTF-8 and may fail on such sites; prefer the recorded `@js:` POST form.
- Distinguish `search.successful` from `search.external_discovery`. Only a target-site URL/form may become `searchBook.requestInfo`; external discovery can prove a detail page but cannot replace a missing target-site search rule.
- Use XPath only for DOM parser fields.
- Resolve relative `detailUrl`, chapter `url`, and image URLs with an XBS `||@js:` suffix based on `params.responseUrl` when the app will not resolve them itself.
- Put content cleanup in `chapterContent.content` using `|@js:`. Never emit a `filter` field.
- Emit optional `bookWorld`, shudan, shuping, or related-word rules only when captured evidence proves their list structure.
- Preserve `status` and `lastChapterTitle`; do not use `state` or `lastChapter`.
- **Omit fields whose values would be empty strings.** The App treats a missing field as "not set," while `""` is a concrete string value that may trigger type mismatch crashes. This applies especially to `password`, `desc`, `httpHeaders`, and `validConfig`. For `httpHeaders` specifically: if no required headers are proven by evidence, omit the field entirely — never emit `""`.
- A Cloudflare clearance cookie belongs to the collector profile, not the generated XBS JSON.
- Set `lastModifyTime` to `"0"`. The server replaces `"0"` with the current timestamp during validation. Never invent a timestamp.
- `sourceUrl` must not have a trailing slash.

## Failure handling

- If collection reports `challenge_detected=true` and `challenge_cleared=false`, stop selector generation and report the exact failure.
- If search is missing, still inspect the homepage for a real form, but do not synthesize a search rule.
- When the chain breaks, emit only the chain stages actually captured (the schema requires only `home`). Leave rule objects empty rather than fabricating selectors; the server fails the result explicitly and your `warnings` become the diagnosis.
- If the target site's search page does not contain the externally discovered exact book, report that selector coverage limitation rather than claiming the test title was returned by native search.
- If detail and chapter pages are the same URL, use the same captured page for both roles and verify each XPath independently.
- If the first chapter is paginated, record this as a limitation unless the next-page behavior was captured and verified. If the chapters page record has `paginated_hint: true`, the directory likely spans multiple pages; add a `chapterList.nextPageUrl` rule only with a verified XPath, otherwise record the limitation.

## Resources

- [references/xbs-rules.md](references/xbs-rules.md): output schema, XPath and XBS pipeline rules.
- [references/extraction.md](references/extraction.md): page-role and selector heuristics.
- [references/cloudflare.md](references/cloudflare.md): challenge behavior and troubleshooting.
- [references/example-source.json](references/example-source.json): one complete verified source for shape and style reference.
- `scripts/collect-site.mjs`: browser collection plus offline XPath inspection.
- `scripts/xbs-encode.mjs`: XXTEA encrypt JSON → XBS binary.
- `scripts/cloudflare-browser.mjs`: persistent Chrome launch, challenge detection/waiting, Turnstile CDP clicking, and clearance verification.
- `assets/cf-turnstile-patcher/`: bundled Chrome extension for CDP `screenX/screenY` correction and Shadow DOM checkbox geometry.
