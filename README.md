# XBS 书源编辑器

> 香色闺阁书源的可视化编辑、管理和 AI 自动生成工具。

[![在线编辑](https://img.shields.io/badge/在线编辑-GitHub_Pages-blue)](https://urzeye.github.io/shuyuan-lab)
[![Fork](https://img.shields.io/badge/Fork-仓库-181717?logo=github)](https://github.com/urzeye/shuyuan-lab/fork)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="assets/github-social.png" alt="shuyuan-lab" width="100%" />

---

> [!IMPORTANT]
> **GitHub Pages 仅提供静态编辑功能**（XBS ↔ JSON 转换、书源管理），不含 AI 生成。AI 生成依赖后端 Agent 服务、Chrome/Chromium 和 Claude Agent SDK，须本地运行。

## 功能

| 静态页面（GitHub Pages） | 本地运行额外提供 |
|---|---|
| XBS ↔ JSON 加解密转换 | AI Agent 自动生成书源 |
| CodeMirror JSON 编辑、格式化 | 真实浏览器采集（首页→搜索→详情→目录→正文） |
| 书源管理（导入/导出/启用/禁用） | Cloudflare JS Challenge / Turnstile 自动处理 |

## 本地运行

### 环境

- Node.js 20+、pnpm
- Google Chrome 或 Chromium
- Anthropic API Key（或兼容网关，由页面用户填写）

### 安装

```bash
git clone https://github.com/urzeye/shuyuan-lab.git
cd shuyuan-lab
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
pnpm dev
```

启动后：

- Web UI → `http://localhost:5173`
- Agent API → `http://localhost:3001`

## 使用

### 静态编辑

1. 拖入 `.xbs` 文件或点击导入
2. 编辑 JSON → 格式化 → 导出为 `.xbs` 或 `.json`

### AI 生成书源

1. 在 `.env` 中配置 `ANTHROPIC_API_KEY` 等凭据
2. 左侧导航 →「AI 生成书源」，输入目标网站 URL + 测试书名
3. 点击「开始生成」，查看 Agent 实时步骤
4. 完成后复制 JSON 或添加到书源管理

生成流程由 Claude Agent SDK 驱动项目内 skill：

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

Agent 先运行受限采集器获取 search/detail/chapters/content 页面快照，再用离线 `inspect` 命令逐项验证 XPath，最终输出可导入的 XBS 书源 JSON。

### 手动采集

```bash
node .claude/skills/xbs-source-generator/scripts/collect-site.mjs collect \
  --url 'https://example.com/' \
  --book '书名' \
  --output '.runtime/manual/evidence.json'
```

## Cloudflare 处理

> [!NOTE]
> 项目自包含，不依赖外部仓库或绝对路径。

- 按 hostname 隔离持久化浏览器 profile
- 自动识别中英文 JS Challenge / Managed Challenge / Turnstile
- 内置 MV3 扩展（`assets/cf-turnstile-patcher/`）修复 CDP 鼠标坐标与 Shadow DOM 检测
- `cf_clearance` 获取后自动刷新并复用同一会话
- Cookie、token、浏览器指纹不会写入生成的 XBS JSON

> [!WARNING]
> 循环 Challenge、图片验证码或站点封禁可能无法自动完成。此时保留 HTML 快照和明确错误信息，不会将 Challenge 页面误当目标内容。

### 环境变量

```dotenv
# .env
AGENT_PORT=3001
ANTHROPIC_API_KEY=                # 必填
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_REASONING_EFFORT=high
XBS_AGENT_HEADLESS=false          # 调试时可设为 true（可能降低过盾率）
XBS_AGENT_BROWSER_CHANNEL=        # 留空自动选择，或指定 chromium
XBS_AGENT_EXTERNAL_DISCOVERY=false # 禁止 DuckDuckGo 外部发现兜底
```

## 技术栈

Vue 3 · Vite · Pinia · CodeMirror 6 · Express · SSE · `@anthropic-ai/claude-agent-sdk` · Playwright · CDP · XXTEA

## 参考

- [香色闺阁书源规则](香色闺阁书源规则.md)
- [UFOAlastor/xiangseguige](https://github.com/UFOAlastor/xiangseguige)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=urzeye/shuyuan-lab&type=Date)](https://star-history.com/#urzeye/shuyuan-lab&Date)

## License

MIT
