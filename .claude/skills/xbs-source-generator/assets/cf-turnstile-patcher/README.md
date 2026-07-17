# CF Turnstile CDP Patcher

This extension is bundled with the `xbs-source-generator` skill and loaded directly from this directory. It has no external runtime dependency.

Chrome 扩展，修复 CDP `Input.dispatchMouseEvent` 导致 `screenX`/`screenY` 异常被 Cloudflare Turnstile 检测的问题。

## 原理

Chrome DevTools Protocol 的 `Input.dispatchMouseEvent` 创建的 MouseEvent 中，`screenX` 会被错误地设为与 `clientX` 相同的值。Cloudflare Turnstile 检测到 `screenX === clientX` 时判定为机器人。

Chromium Bug: <https://issues.chromium.org/issues/40280325>

## 项目内使用

采集器会自动从当前目录加载扩展，不需要用户手动安装。它同时将 `script.js` 注册为 Playwright init script，兼容限制命令行加载未打包扩展的 Chrome 版本。

启动参数：

```js
const context = await chromium.launchPersistentContext(userDataDir, {
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});
await context.addInitScript({ path: `${extensionPath}/script.js` });
```

### 手动诊断

1. 打开 Chrome → `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择当前 `assets/cf-turnstile-patcher/` 目录

扩展只修复事件坐标和暴露 frame 内 checkbox 几何信息。实际 iframe 定位、CDP 点击、等待和 `cf_clearance` 刷新由 `scripts/cloudflare-browser.mjs` 完成。

## 文件结构

```
cf-turnstile-patcher/
├── manifest.json    # Chrome Extension Manifest V3
├── script.js        # 核心补丁脚本
└── README.md        # 本文件
```
