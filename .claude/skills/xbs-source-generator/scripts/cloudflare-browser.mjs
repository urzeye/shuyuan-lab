import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const challengeMarkers = [
  "Just a moment",
  "Checking your browser",
  "Performing security verification",
  "Verify you are human",
  "Enable JavaScript and cookies to continue",
  "请稍候",
  "正在进行安全验证",
  "验证您不是自动程序",
  "正在等待",
  "启用 JavaScript 和 Cookie",
];

function profileName(hostname) {
  const safe = hostname.replace(/[^a-z0-9.-]/gi, "-").slice(0, 60);
  const digest = createHash("sha256").update(hostname).digest("hex").slice(0, 10);
  // Bump when launch or extension semantics change so stale Chrome preferences do
  // not keep a previously disabled unpacked extension.
  return `${safe}-${digest}-v2`;
}

export async function readChallengeState(page) {
  return page.evaluate((markers) => {
    const title = document.title || "";
    const text = (document.body?.innerText || "").slice(0, 3000);
    const html = document.documentElement?.outerHTML || "";
    const iframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
    const response = document.querySelector('[name="cf-turnstile-response"]');
    const managedChallenge =
      html.includes("_cf_chl_opt") ||
      html.includes("/cdn-cgi/challenge-platform/") ||
      Boolean(document.querySelector("#challenge-running, #challenge-stage, .main-content"));
    return {
      title,
      interstitial:
        managedChallenge || markers.some((marker) => title.includes(marker) || text.includes(marker)),
      managedChallenge,
      hasIframe: Boolean(iframe),
      hasToken: Boolean(response && response.value),
      bodyLength: html.length,
    };
  }, challengeMarkers);
}

async function readChallengeStateDuringNavigation(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await readChallengeState(page);
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Target closed/i.test(error.message)) {
        throw error;
      }
      await page.waitForTimeout(300);
    }
  }
  return null;
}

// Turnstile token 的 input 在跨域 challenge iframe 内，主页面 DOM 查不到。
// 在 challenge frame 内 evaluate 才能拿到真实状态。
async function hasFrameTurnstileToken(page) {
  for (const frame of page.frames()) {
    if (!frame.url().includes("challenges.cloudflare.com")) continue;
    const has = await frame
      .evaluate(
        () => Boolean(document.querySelector('[name="cf-turnstile-response"]')?.value),
      )
      .catch(() => false);
    if (has) return true;
  }
  return false;
}

async function clickFrameCheckbox(page) {
  const frame = page.frames().find((item) => item.url().includes("challenges.cloudflare.com"));
  if (!frame) return null;
  const checkbox = frame.locator('input[type="checkbox"]').first();
  if (!(await checkbox.isVisible({ timeout: 800 }).catch(() => false))) return null;
  const box = await checkbox.boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 35, y - 12, { steps: 8 });
  await page.mouse.move(x, y, { steps: 18 });
  await page.mouse.click(x, y, { delay: 80 });
  return "frame-checkbox";
}

async function clickViaCdp(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    const { nodes } = await cdp.send("DOM.getFlattenedDocument", {
      depth: -1,
      pierce: true,
    });
    const iframeNode = nodes.find((node) => {
      if (node.nodeName !== "IFRAME" || !node.attributes) return false;
      for (let index = 0; index < node.attributes.length; index += 2) {
        if (
          node.attributes[index] === "src" &&
          node.attributes[index + 1]?.includes("challenges.cloudflare.com")
        ) return true;
      }
      return false;
    });
    if (!iframeNode) return null;

    const { model } = await cdp.send("DOM.getBoxModel", { nodeId: iframeNode.nodeId });
    const [left, top, rightTop, , rightBottom, bottom] = model.content;
    const width = Math.max(rightTop - left, rightBottom - left);
    const height = Math.max(bottom - top, 60);
    const frameInfo = await Promise.all(
      page.frames()
        .filter((frame) => frame.url().includes("challenges.cloudflare.com"))
        .map((frame) => frame.evaluate(() => window.__cfCheckboxInfo || null).catch(() => null)),
    ).then((values) => values.find(Boolean) || null);
    // The managed-challenge widget is 300x65 and its checkbox is near the left edge.
    // Older code used 35%, which clicks the label instead of the control on current Turnstile.
    const xRatio = frameInfo?.xRatio ?? 0.08;
    const yRatio = frameInfo?.yRatio ?? 0.5;
    const x = left + width * xRatio;
    const y = top + height * yRatio;

    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: Math.max(left + 2, x - 42),
      y: Math.max(top + 2, y - 18),
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await new Promise((resolve) => setTimeout(resolve, 110));
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 70));
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    return {
      method: frameInfo ? "cdp-shadow-geometry" : "cdp-iframe-left-checkbox",
      x: Math.round(x),
      y: Math.round(y),
      iframe: {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
      },
    };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

export async function clearCloudflare(page, timeoutMs = 90_000) {
  const startedAt = Date.now();
  let detected = false;
  let attempts = 0;
  const methods = [];
  const clicks = [];
  let nextClickAt = 0;
  let clearanceReloaded = false;
  let finalStatus = null;

  while (Date.now() - startedAt < timeoutMs) {
    const state = await readChallengeStateDuringNavigation(page);
    if (!state) {
      await page.waitForTimeout(500);
      continue;
    }
    const hasChallengeFrame =
      state.hasIframe ||
      page.frames().some((frame) => frame.url().includes("challenges.cloudflare.com"));
    const active = state.interstitial || (hasChallengeFrame && state.bodyLength < 80_000);
    if (!active) {
      return {
        detected,
        cleared: true,
        attempts,
        methods,
        clicks,
        clearanceReloaded,
        finalStatus,
        finalTitle: state.title,
      };
    }
    detected = true;
    const hasClearance = (await page.context().cookies(page.url()))
      .some((cookie) => cookie.name === "cf_clearance" && cookie.value);
    if (hasClearance && !clearanceReloaded) {
      clearanceReloaded = true;
      methods.push("cf-clearance-reload");
      const response = await page
        .reload({ waitUntil: "domcontentloaded", timeout: 45_000 })
        .catch(() => null);
      finalStatus = response?.status?.() ?? finalStatus;
      await page.waitForTimeout(2_000);
      continue;
    }
    const frameHasToken = hasChallengeFrame && (await hasFrameTurnstileToken(page));
    if (hasChallengeFrame && !state.hasToken && !frameHasToken && Date.now() >= nextClickAt) {
      attempts += 1;
      const frameMethod = await clickFrameCheckbox(page).catch(() => null);
      const click = frameMethod
        ? { method: frameMethod }
        : await clickViaCdp(page).catch(() => null);
      if (click) {
        methods.push(click.method);
        clicks.push({ ...click, at_ms: Date.now() - startedAt });
        // Managed Challenge may spend 10-20 seconds validating after a valid click.
        // Repeated clicks during that window can reset or invalidate the attempt.
        nextClickAt = Date.now() + 20_000;
      } else {
        nextClickAt = Date.now() + 2_000;
      }
    }
    await page.waitForTimeout(750);
  }

  const state = (await readChallengeStateDuringNavigation(page)) || {
    title: "",
    interstitial: true,
    hasIframe: true,
  };
  return {
    detected,
    cleared: !state.interstitial && !state.hasIframe,
    attempts,
    methods,
    clicks,
    clearanceReloaded,
    finalStatus,
    finalTitle: state.title,
    error: "challenge_timeout",
  };
}

export async function launchChallengeContext({
  hostname,
  runtimeRoot,
  extensionDir,
  headless = false,
}) {
  if (!existsSync(path.join(extensionDir, "manifest.json"))) {
    throw new Error("Cloudflare patch extension is missing from the skill assets");
  }
  const profileDir = path.join(runtimeRoot, "browser-profiles", profileName(hostname));
  await mkdir(profileDir, { recursive: true });

  const launchOptions = {
      headless,
      // Playwright disables extensions by default; remove that flag so the bundled
      // Turnstile patcher is actually loaded in the main page and challenge frames.
      ignoreDefaultArgs: ["--disable-extensions"],
      viewport: { width: 1366, height: 850 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    };
  const configuredChannel = process.env.XBS_AGENT_BROWSER_CHANNEL?.trim();
  const launchCandidates = configuredChannel
    ? [configuredChannel === "chromium" ? null : configuredChannel]
    : ["chrome", null];
  let context = null;
  const failures = [];
  for (const channel of launchCandidates) {
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        ...launchOptions,
        ...(channel ? { channel } : {}),
      });
      break;
    } catch (error) {
      failures.push(`${channel || "playwright-chromium"}: ${error.message}`);
    }
  }
  if (!context) {
    throw new Error(`browser_launch_failed: ${failures.join(" | ")}`);
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    window.chrome = window.chrome || { runtime: {} };
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });
  // Use the bundled patch as an init script as well as an unpacked extension.
  // This keeps the critical frame-local MouseEvent/Shadow DOM fix active on
  // platforms that restrict command-line extension loading.
  await context.addInitScript({ path: path.join(extensionDir, "script.js") });
  return context;
}
