# XBS output rules

## Minimum top-level object

Return one source object with these fields:

```json
{
  "sourceName": "站点名称",
  "sourceUrl": "https://example.com/",
  "enable": 1,
  "weight": "9000",
  "miniAppVersion": "2.53.2",
  "lastModifyTime": "0",
  "desc": "由 Agent 根据实测页面生成",
  "password": "",
  "sourceType": "text",
  "httpHeaders": "",
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
  "host": "https://example.com",
  "validConfig": ""
}
```

## Required rule fields

- `searchBook`: `requestInfo`, `list`, `bookName`, `detailUrl`; add author, cover, desc, cat, status, wordCount, lastChapterTitle only when verified.
- `bookDetail`: verified bookName/author/cover/desc/cat/status/wordCount/lastChapterTitle fields. It may be sparse.
- `chapterList`: `list`, `title`, `url` and a real `requestInfo` only if the directory is a separate URL.
- `chapterContent`: `content`; add `nextPage` only after pagination is observed.

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

Do not add unobserved ad phrases. Do not use a `filter` property.

## Output invariants

- `sourceType` is one of `text`, `comic`, `audio`, `video`.
- `actionID` equals its containing rule key.
- `status`, not `state`.
- `lastChapterTitle`, not `lastChapter`.
- `weight` and `lastModifyTime` are strings for broad compatibility.
- No browser cookies, Cloudflare tokens, API keys, proxy credentials, or machine paths appear in the source JSON.
- External discovery engines are evidence-only. Their URLs and request syntax must never be emitted as the target site's `searchBook.requestInfo`.
- When native search cannot be proven, keep the limitation in `warnings` rather than fabricating a working search rule from the discovered detail URL.
