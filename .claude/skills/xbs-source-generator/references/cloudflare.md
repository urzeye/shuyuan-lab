# Cloudflare browser handling

The skill bundles its complete Cloudflare browser implementation and has no dependency on another repository or machine-specific path.

`scripts/cloudflare-browser.mjs` provides runtime logic and `assets/cf-turnstile-patcher/` provides the browser extension. The collector uses this layered strategy:

1. Launch a persistent, headed Chrome context with `--disable-blink-features=AutomationControlled`; fall back to Playwright Chromium when Chrome is unavailable.
2. Load `assets/cf-turnstile-patcher` to patch CDP mouse `screenX/screenY` behavior and capture Shadow DOM checkbox geometry.
3. Wait for ordinary Cloudflare JS Challenge navigation to finish.
4. For interactive Turnstile, locate the challenge iframe through CDP's flattened DOM and dispatch a human-like click; fall back to frame-local checkbox clicking.
5. Persist cookies and browser storage by target hostname in `.runtime/browser-profiles/`.

The deployment only needs this skill directory, project dependencies, and a local Chrome/Chromium installation. No source file is loaded from another project at runtime.

The evidence records challenge detection, attempts, click coordinates, methods, clearance reloads, final title, and final URL. A challenge is cleared only when the page is no longer a Cloudflare interstitial and meaningful target HTML is available. Some sites keep the initial HTTP 403 status even after returning the real document; these are marked `recovered_challenge_response=true` only when the challenge cleared and substantial target HTML was captured.

## Environment variables

| Variable | Effect |
|----------|--------|
| `XBS_AGENT_BROWSER_CHANNEL` | `chromium` forces Playwright Chromium. Empty tries local Chrome first, Chromium second. |
| `XBS_AGENT_HEADLESS` | `true` runs headless as a diagnostic fallback; may reduce challenge pass rate. |
| `XBS_AGENT_EXTERNAL_DISCOVERY` | `false` disables the external search-engine discovery fallback. |

Browser profiles persist per hostname under `.runtime/browser-profiles/` so a solved clearance survives across runs. They are safe to delete (the next run just re-solves the challenge) and can grow large over time; prune stale hostnames when disk matters.

## Important boundaries

- Never place `cf_clearance`, Turnstile response tokens, or profile data into XBS output.
- Do not switch to direct HTTP after a browser challenge; keep all stage navigation in the same browser context.
- Run headed mode for extension support. `XBS_AGENT_HEADLESS=true` is a diagnostic fallback and may reduce challenge pass rate.
- If IP reputation triggers an interactive image challenge, report it as unresolved rather than claiming clearance.

## Failure clues

- `browser_launch_failed`: Chrome is absent or cannot open a persistent context.
- `challenge_timeout`: the interstitial or Turnstile remained after all attempts.
- HTTP 403/429 with a remaining interstitial or empty target HTML: the page is still blocked. A 403 with `recovered_challenge_response=true` is retained as evidence but treated as accessible target content.
- Search failures after clearance usually indicate a wrong form candidate, not another CF failure; inspect `search.attempts`.
