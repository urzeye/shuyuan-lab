# XBS 书源编辑器 · xiangseguige-source-editor

> 香色闺阁（XBS / xiangseguige）书源的可视化编辑、管理和 Agent 自动生成工具。

[![在线使用](https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E4%BD%BF%E7%94%A8-GitHub%20Pages-blue)](https://urzeye.github.io/xiangseguige-source-editor)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 功能

| 功能 | 说明 |
|---|---|
| **XBS ↔ JSON 转换** | 解密 `.xbs` 为可读 JSON，或将 JSON 重新加密为 `.xbs` |
| **JSON 编辑器** | CodeMirror 语法高亮、格式化和直接编辑 |
| **书源管理** | 查看、启用、禁用、删除和导出多个书源 |
| **AI 生成书源** | 左侧导航直接进入，无需先导入书源；按钮触发 Claude Agent SDK 和项目内 XBS skill |
| **真实浏览器采集** | 按首页、搜索、详情、目录和正文建立可回溯证据链 |
| **Cloudflare 处理** | 持久化浏览器配置、JS Challenge 等待、Turnstile 扩展补丁、CDP 点击和 clearance 复用 |

## 在线版与本地版

GitHub Pages 在线版可使用 XBS 编辑、转换和管理功能。

AI 生成依赖 Node.js Agent 服务、Chrome/Chromium 和 Claude Agent SDK，静态页面无法独立提供这些能力。需要 AI 生成功能时请在本地或自建服务器运行完整项目。

## 本地运行

### 环境要求

- Node.js 20+
- pnpm
- Google Chrome 或 Playwright 可用的 Chromium
- Anthropic API Key，或兼容 Claude Agent SDK 的网关凭据（由页面用户填写）

### 安装与启动

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
pnpm dev
```

默认服务：

- Web UI：`http://localhost:5173`
- Agent API：`http://localhost:3001`
- 健康检查：`http://localhost:3001/api/agent/health`

`.env` 示例：

```dotenv
AGENT_PORT=3001
XBS_AGENT_HEADLESS=false
XBS_AGENT_BROWSER_CHANNEL=
```

API Key、Base URL 和模型不通过项目文件或服务端环境变量配置，必须由页面用户填写。为便于重复使用，这三项和推理强度会保存在当前浏览器的 `localStorage`，不会写入仓库或服务端配置。

## 使用说明

### XBS 文件编辑

1. 将 `.xbs` 文件拖到首页，或点击导入按钮。
2. 工具自动解密并展示 JSON，可直接修改和格式化。
3. 导出为 `.xbs` 或明文 `.json`。

### 书源管理

1. 导入包含多个书源的 `.xbs` 或 `.json`。
2. 在「书源管理」中查看、启用、禁用或删除条目。
3. 可仅导出启用的书源。

### Agent 生成书源

左侧导航直接点击「AI 生成书源」，无需预先导入任何文件。

1. 配置 API Key、Base URL、模型和推理强度。
2. 输入目标网站主页和测试书名。
3. 点击「开始生成」。
4. 查看 Agent 步骤、工具调用和采集日志。
5. 完成后复制 JSON，或点击「添加到书源管理」。

生成流程不是单个提示词请求，而是由 Claude Agent SDK 驱动项目内 skill：

```text
.claude/skills/xbs-source-generator/
├── SKILL.md
├── references/
│   ├── cloudflare.md
│   ├── extraction.md
│   └── xbs-rules.md
├── scripts/
│   ├── cloudflare-browser.mjs
│   └── collect-site.mjs
└── assets/cf-turnstile-patcher/
    ├── manifest.json
    └── script.js
```

Agent 必须先运行受限采集器，再读取 evidence 和 HTML 快照，并用离线 `inspect` 命令逐项验证关键 XPath。服务端通过 `PreToolUse` hook 限制 Agent 只能读取当前 skill、当前任务证据，以及执行 skill 自带的 `collect`/`inspect` 命令。

## Cloudflare 处理

Cloudflare 能力是项目自包含的可执行代码，不依赖其他仓库或本机绝对路径：

- 每个 hostname 使用独立持久化浏览器 profile。
- 自动识别中英文 JS Challenge 和 Managed Challenge。
- 等待普通五秒盾自动完成。
- Turnstile 出现时，优先使用 frame checkbox，失败后通过 CDP 穿透 iframe/Shadow DOM 获取位置并点击。
- skill 内置 MV3 扩展和 init script，修复 challenge frame 的鼠标坐标与 Shadow DOM 可见性问题。
- 获取 `cf_clearance` 后刷新并复用同一会话访问详情、目录和正文。
- Cookie、Turnstile token 和浏览器指纹不会写入生成的 XBS JSON。

Cloudflare 的风控结果仍取决于出口 IP、浏览器环境和站点策略。循环 Challenge、图片验证码或站点主动封禁可能无法自动完成；此时任务会保留截图外的 HTML、点击坐标、尝试方法和明确错误，不会将 Challenge 页面误当目标内容。

## 搜索与证据策略

采集器优先使用首页真实表单和常见站内搜索路由。只有站内搜索无法得到可访问的精确详情页时，才会使用 DuckDuckGo HTML 搜索做同源详情发现；只接受与目标站点同 origin 且符合书籍详情路径的 URL。第三方搜索结果不会直接成为书源规则。

如需禁止该兜底：

```dotenv
XBS_AGENT_EXTERNAL_DISCOVERY=false
```

所有任务证据保存在 `.runtime/agent-tasks/`，该目录默认不提交 Git。

## 验证与构建

```bash
# 校验 skill 文件、frontmatter、CF 资产和外部路径依赖
pnpm skill:validate

# 前端、Vite 和 Agent 服务 TypeScript 构建
pnpm build

# 生产模式同时启动 Web UI 与 Agent API
pnpm start
```

生产模式访问 `http://127.0.0.1:3001/xiangseguige-source-editor/`。根路径会自动跳转到该地址。

手动采集示例：

```bash
node .claude/skills/xbs-source-generator/scripts/collect-site.mjs collect \
  --url 'https://www.69shuba.com/' \
  --book '斗罗大陆' \
  --output '.runtime/manual-69shuba/evidence.json'
```

采集器会输出 `home`、`search`、`detail`、`chapters`、`content` 页面链和对应快照。生成结果仍应在香色闺阁中实际导入验证。

## 数据与密钥

- API Key、Base URL 和模型保存在当前浏览器 `localStorage`，生成时随请求发送给 Agent 服务并注入本次 SDK 进程；服务端不持久化，日志输出会脱敏。请只在可信设备上使用。
- 目标页面快照和测试书名会提供给配置的模型服务。
- 启用外部详情发现时，目标 hostname 和测试书名会发送给 DuckDuckGo。
- Cloudflare Cookie 和验证 token 只保存在本地 `.runtime` 浏览器 profile，不进入书源 JSON。

## 技术栈

- Vue 3、Vite、Pinia、CodeMirror 6
- Express Agent API 和 Server-Sent Events
- `@anthropic-ai/claude-agent-sdk`
- Playwright、Chrome DevTools Protocol、MV3 扩展
- XXTEA `.xbs` 加解密

## 关于香色闺阁 / XBS

香色闺阁（xiangseguige）使用自定义书源规则聚合小说和漫画站点。本项目用于制作、验证和管理书源。

书源字段和规则语法参阅 [香色闺阁书源规则.md](香色闺阁书源规则.md)。

其他参考：[UFOAlastor/xiangseguige](https://github.com/UFOAlastor/xiangseguige)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=urzeye/xiangseguige-source-editor&type=Date)](https://star-history.com/#urzeye/xiangseguige-source-editor&Date)

## License

MIT
