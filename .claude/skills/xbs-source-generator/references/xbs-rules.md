# XBS output rules

## Minimum top-level object

Return one source object with these fields:

```json
{
  "sourceName": "站点名称",
  "sourceUrl": "https://example.com",
  "enable": 1,
  "weight": "9000",
  "miniAppVersion": "2.53.2",
  "lastModifyTime": "1700000000.000000",
  "sourceType": "text",
  "searchBook": {},
  "bookDetail": {},
  "chapterList": {},
  "chapterContent": {},
  "bookWorld": {},
  "shudanList": {},
  "shudanDetail": { "actionID": "shudanDetail", "parserID": "DOM" },
  "shupingList": { "actionID": "shupingList", "parserID": "DOM" },
  "shupingHome": { "actionID": "shupingHome", "parserID": "DOM" },
  "searchShudan": { "actionID": "searchShudan", "parserID": "DOM" },
  "relatedWord": { "actionID": "relatedWord", "parserID": "DOM" }
}
```

Each of `searchBook`, `bookDetail`, `chapterList`, and `chapterContent` uses:

```json
{
  "actionID": "<same as object key>",
  "parserID": "DOM",
  "responseFormatType": "html",
  "host": "https://example.com"
}
```

Do not add `validConfig`, `httpHeaders`, `requestInfo`, or any other field unless the evidence proves it is needed.

## Required rule fields

- `searchBook`: `requestInfo`, `list`, `bookName`, `detailUrl`; add author, cover, desc, cat, status, wordCount, lastChapterTitle only when verified.
- `bookDetail`: verified bookName/author/cover/desc/cat/status/wordCount/lastChapterTitle fields. It may be sparse.
- `chapterList`: `list`, `title`, `url` and a real `requestInfo` only if the directory is a separate URL.
- `chapterContent`: `content`; add `nextPageUrl` only after pagination is observed. `nextPageUrl` pairs with `moreKeys.maxPage`; without a captured max page, omit `moreKeys`.
- `chapterList.nextPageUrl` follows the same rule when the directory itself paginates (see `paginated_hint` in evidence).

## Request syntax

GET search example:

```text
https://example.com/search?keyword=%@keyWord&page=%@pageIndex
```

Only emit an `@js:` POST request when the browser evidence records the form method, action, and input name:

```javascript
@js:
let url = config.host + '/search';
return {url, POST: true, httpParams: {searchkey: params.keyWord}, httpHeaders: config.httpHeaders};
```

### requestInfo placeholders

| Placeholder | Meaning |
|-------------|---------|
| `%@keyWord` | search keyword |
| `%@pageIndex` | page number (1-based) |
| `%@filter` | single filter value |
| `%@result` | previous step result |

### Variables available inside `@js:`

| Variable | Meaning |
|----------|---------|
| `config.host` | site host |
| `config.httpHeaders` | global request headers |
| `params.keyWord` | search keyword |
| `params.pageIndex` | current page number |
| `params.filters` | multi-key filter object |
| `params.responseUrl` | actual response URL |
| `params.nativeTool` | native helper (XPath evaluation, logging) |
| `result` | previous step result |

## XPath syntax

- A `list` XPath is evaluated against the document.
- Child fields are evaluated relative to each list node; use `.//` for descendants.
- Text: `.//h3/a/text()`
- Attribute: `.//a/@href`
- Normalize noisy text: `normalize-space(.//h1)`
- Avoid absolute numeric paths such as `/html/body/div[3]/div[2]`.

XBS alternatives use `||`:

```text
.//h1/text() || //meta[@property='og:novel:book_name']/@content
```

Append JavaScript URL normalization with `||@js:`:

```javascript
.//a/@href ||@js:
return new URL(result, params.responseUrl).href;
```

Append content cleanup with `|@js:`:

```javascript
//div[@id='content'] |@js:
return result
  .replace(/上一章|下一章|返回目录/g, '')
  .replace(/请记住本站域名[^<]*/g, '');
```

Strip a fixed prefix with `|@replace:` (simpler than `|@js:` when no pattern logic is needed):

```text
//div[@id='info']/p[3]|@replace:最后更新：
```

Do not add unobserved ad phrases. Do not use a `filter` property.

`||`, `||@js:`, `|@js:`, and `|@replace:` are XBS rule syntax, not XPath. The offline inspector accepts plain XPath only; inspect each `||` branch separately.

## Advanced parsers (use sparingly)

- `parserID: "JSParser"` replaces the whole rule's parsing with a JavaScript function. Only reach for it when DOM XPath cannot express the extraction at all.
- `bookWorld` supports `requestFilters` for category/ discovery filtering. Emit only when the captured evidence proves the filter structure.

See [example-source.json](example-source.json) for one complete verified source.

## Output invariants

- `sourceType` is one of `text`, `comic`, `audio`, `video`.
- `actionID` equals its containing rule key.
- `status`, not `state`.
- `lastChapterTitle`, not `lastChapter`.
- `weight` and `lastModifyTime` are strings for broad compatibility. Set `lastModifyTime` to `"0"`; the server replaces it with the current timestamp during validation. Never invent a timestamp.
- `sourceUrl` must not have a trailing slash.
- `desc` is only emitted when the source has a real human-written description. Omit or use `""` otherwise — never inject auto-generated filler text.
- `password` is only emitted when a source actually needs one. Omit otherwise.
- `httpHeaders` is only emitted when one or more required headers are proven by evidence. When present it must be a JSON object `{}`, never a string. When absent, the App treats it as no global headers.
- No browser cookies, Cloudflare tokens, API keys, proxy credentials, or machine paths appear in the source JSON.
- External discovery engines are evidence-only. Their URLs and request syntax must never be emitted as the target site's `searchBook.requestInfo`.
- When native search cannot be proven, keep the limitation in `warnings` rather than fabricating a working search rule from the discovered detail URL.
