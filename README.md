# 📈 股市故事

**一个在自己 Mac 上运行的中文投研台。** 一组 AI 研究助手每天按时写简报、研报和公告速览，覆盖 A 股、港股、宏观、汇率和加密资产；你打开浏览器就能读、追问、整理和复盘。

*A private, Mandarin-first stock research desk that runs on your own Mac: a team of AI research agents writes daily briefs, equity notes and filing digests on a schedule, and a clean reading room lets you skim, ask follow-ups, organise and score the calls.*

> 基于字节跳动开源的 [DeerFlow](https://github.com/bytedance/deer-flow)（MIT 许可证）二次开发：在它的多智能体框架之上，加了中文投研界面、研究助手团队、行情数据、研报库和预测记录。
> *Built on [DeerFlow](https://github.com/bytedance/deer-flow) by ByteDance (MIT).*

![今日简报](market-desk/screenshots/01-today.png)

---

## 它能做什么

- **每天早上一页看完**：「今日」页把指数、汇率、利率、商品和加密行情，新研报，需要你确认的预测，以及即将发生的事件放在一起。
- **研报像收件箱一样读**：按时间排列，未读、收藏、归档、笔记、项目一应俱全；先看要点，再看全文；一键追问、审稿、重写或导出。
- **一组分工明确的研究助手**：首席分析师、个股研究员、行业研究员、宏观策略师、事件监控员、风控审稿人，按统一的研报规范写作：数据有出处，有多空对辩，有情景估值，有反方观点。
- **自动按时干活**：盘前简报、收盘复盘、公告扫描、催化剂日历、周报、投资逻辑周检、自选股深度研究、周度审稿，到点自动运行，结果直接进研报收件箱。
- **预测会被打分**：助手写下的判断进入「预测记录」，到期由助手提出结果，你确认；准确度用图表长期追踪。
- **每只股票一页**：K 线、估值、最新观点、投资逻辑及其每根支柱的状态，以及所有相关研报和对话的时间线。
- **项目**：把同一主题的研报和对话放在一起；系统会自动建议，你确认即可。
- **全部在本机**：研报是普通的 Markdown 文件，存在你自己的硬盘上；API 密钥只存在本地 `.env`，永远不会上传。
- **为非技术用户设计**：开机自动启动，全中文界面，「教程模式」下鼠标放到任何东西上都有说明，「系统状态」页告诉你哪里出了问题、该怎么办。

---

## 界面一览

| | |
|---|---|
| **研报**：收件箱、筛选、阅读器、追问 ![研报](market-desk/screenshots/02-reports.png) | **股票页**：行情、K 线、投资逻辑、时间线 ![股票](market-desk/screenshots/03-stock.png) |
| **项目**：同一主题的研报和对话 ![项目](market-desk/screenshots/04-projects.png) | **预测记录**：助手的判断及其准确度 ![预测](market-desk/screenshots/05-calls.png) |
| **助手**：研究团队，每人一张卡片 ![助手](market-desk/screenshots/06-agents.png) | **定时任务**：什么时候、谁、做什么 ![定时](market-desk/screenshots/07-schedules.png) |
| **对话**：直接问，或从研究模板开始 ![对话](market-desk/screenshots/09-chat.png) | **⌘K 搜索**：股票、研报、对话一处搜 ![搜索](market-desk/screenshots/10-search.png) |
| **系统状态**：每个部件是否正常、怎么修 ![状态](market-desk/screenshots/08-health.png) | **深色模式** ![深色](market-desk/screenshots/01-today-dark.png) |

---

## 每天怎么用

1. **早上打开电脑**：浏览器会自动打开 <http://localhost:2026>，进入「今日」页。
2. **扫一眼「今日」**：看行情和「需要你处理」，例如要确认的预测、失败的任务、建议建立的项目。
3. **读研报**：点左侧「研报」。键盘 `j` / `k` 上下切换，`s` 收藏，`e` 归档，`u` 标为未读，`/` 搜索。
4. **有疑问就追问**：在阅读器里点「追问」，会带着这份研报开一个新对话。
5. **开始新研究**：点左上角「新研究」，写下你想研究的东西，或选一个模板（个股研报、财报点评、对比、行业、投资逻辑……）。
6. **找东西**：按 `⌘K`，输入股票名、代码或关键词。
7. **周末复盘**：在「研报 → 预测记录」里确认助手提出的结果，看准确度变化。

---

## 研究团队

| 助手 | 擅长 |
|---|---|
| **首席分析师** | 默认助手。日常提问、每日简报，按需调动其他技能 |
| **个股研究员** | 单只 A 股 / 港股深度研究、财报点评、维护每只股票的投资逻辑 |
| **行业研究员** | 市场规模、竞争格局、产业链与上市公司 |
| **宏观策略师** | 宏观、利率、汇率、商品与加密资产周报，预测打分 |
| **事件监控员** | 公告扫描、催化剂日历 |
| **风控审稿人** | 按研报规范逐项审稿，指出缺数据、缺出处、缺反方观点的地方 |

| 定时任务 | 时间（北京时间） | 负责 |
|---|---|---|
| 盘前简报 | 工作日 08:45 | 首席分析师 |
| 收盘复盘 | 工作日 15:45 | 首席分析师 |
| 每日公告扫描 | 工作日 18:30 | 事件监控员 |
| 催化剂日历 | 周一 07:30 | 事件监控员 |
| 宏观、汇率与加密资产周报 | 周六 10:30 | 宏观策略师 |
| 投资逻辑周检 | 周三 20:00 | 个股研究员 |
| 自选股深度研究 | 周日 20:30 | 个股研究员 |
| 周度审稿 | 周日 21:30 | 风控审稿人 |

时间、内容、负责的助手都可以在「定时任务」页里修改，也可以随时点「立即运行」。助手的人设和工作方式可以在「助手」页修改。

---

## 安装与设置（macOS）

第一次安装大约需要 20–30 分钟，大部分时间在下载依赖和构建网页。所有命令都在「终端」（Terminal）里运行。

### 第 1 步：准备工具

| 工具 | 版本 | 怎么装 |
|---|---|---|
| macOS | 12 或更新 | Apple 芯片和 Intel 都可以 |
| [Homebrew](https://brew.sh) | 最新 | 按官网首页的一行命令安装 |
| Git | 任意 | `xcode-select --install`，或 `brew install git` |
| Node.js | **22 或更新** | `brew install node` |
| uv（Python 管理） | 最新 | `brew install uv`，它会自动准备 Python 3.12+ |
| pnpm | 最新 | 安装脚本会通过 Node 自带的 corepack 启用 |
| nginx | 最新 | `brew install nginx` |

你只需要先装好 Homebrew 和 Git，其余的工具第 4 步的安装脚本发现缺少时会自动用 Homebrew 安装。另外请留出约 5 GB 硬盘空间。

### 第 2 步：申请 API 密钥

**行情数据不需要任何密钥**：指数、个股、汇率、利率和商品来自腾讯财经和新浪财经的公开行情，加密资产来自 CoinGecko。

你需要一个**大模型密钥**（必需）和一个**搜索密钥**（强烈推荐）。

#### 大模型（必选一个）

研究技能是按 **DeepSeek** 调好的，中文研报质量最好，费用也最低，推荐首选。

| 服务 | 申请地址 | 说明 |
|---|---|---|
| **DeepSeek**（推荐） | <https://platform.deepseek.com> | 充值后在「API keys」创建。几十元可以用好几周的每日简报。设置向导里选 `deepseek-v4-pro` |
| 火山引擎方舟 | <https://console.volcengine.com/ark> | 一个密钥可用豆包、DeepSeek、Kimi、GLM，人民币计费 |
| Moonshot Kimi | <https://platform.moonshot.cn> | 中文长文本 |
| 智谱 GLM（Z.AI） | <https://z.ai> · 国内 <https://open.bigmodel.cn> | |
| MiniMax | <https://www.minimax.io> · 国内 <https://platform.minimaxi.com> | |
| OpenAI | <https://platform.openai.com/api-keys> | |
| Anthropic Claude | <https://console.anthropic.com> | |
| Google Gemini | <https://aistudio.google.com/apikey> | |
| OpenRouter | <https://openrouter.ai/keys> | 一个密钥调用多家模型 |
| Ollama（本地模型） | <https://ollama.com> | 不需要密钥，完全离线，但需要性能较好的电脑，研报质量明显较低 |

#### 网页搜索（选一个，以后可以随时切换）

| 服务 | 申请地址 | 说明 | 切换命令 |
|---|---|---|---|
| **Tavily**（推荐起步） | <https://app.tavily.com> | 每月 1000 次免费，不用绑卡 | `deskctl.sh search tavily` |
| 腾讯云联网搜索 WSA | <https://console.cloud.tencent.com/wsapi/index> | 国内网站覆盖最好；需要实名认证并购买套餐。用「服务 API KEY」，不是 SecretId/SecretKey | `deskctl.sh search tencent` |
| BytePlus InfoQuest | <https://console.byteplus.com> | 搜索加网页读取 | `deskctl.sh search infoquest` |
| Brave Search | <https://brave.com/search/api/> | 有免费额度 | `deskctl.sh search brave` |
| Serper（Google 结果） | <https://serper.dev> | 有免费额度 | `deskctl.sh search serper` |
| DuckDuckGo | 不需要 | 免费、无密钥，但结果最少，只适合试用 | `deskctl.sh search ddg` |

#### 可选

| 服务 | 申请地址 | 作用 |
|---|---|---|
| Jina Reader | <https://jina.ai/reader> | 读取网页全文；不填也能用，填了速度限制更宽 |
| LangSmith | <https://smith.langchain.com> | 记录助手每一步做了什么、用了多少 token，方便排查 |

更详细的申请步骤见 [`market-desk/API-KEYS.md`](market-desk/API-KEYS.md)。

### 第 3 步：下载项目

```bash
cd ~/Desktop
git clone https://github.com/<你的用户名>/gushi-story.git
cd gushi-story
```

### 第 4 步：一键安装（推荐）

```bash
bash market-desk/start-here.sh
```

脚本会做这 9 件事。每一步都会先检查，已经做过的会跳过，中途出错修好后重新运行即可：

1. 检查工具，缺少的自动用 Homebrew 安装
2. 安装依赖（`make install`）
3. 运行设置向导（`make setup`），需要你回答几个问题：
   - **模型**：选 `DeepSeek` → `deepseek-v4-pro`，然后粘贴密钥
   - **网页搜索**：选 `Tavily`（或你申请了密钥的那个），然后粘贴密钥
   - **Sandbox / 执行环境**：选 `Local`（本机）
   - **Enable bash command execution?**：选 **yes**。研究技能要在本机运行 Python 脚本获取行情，选 no 会拿不到数据
   - 其他问题（IM 渠道等）直接回车跳过
4. 打开投研台需要的开关，界面语言设为中文，并建好研报库和一份示例自选股
5. 检查 API 密钥，缺的会提示你粘贴（只保存在本地 `.env`）
6. 应用中文界面
7. 安装桌面图标和开机自动启动（见第 6 步）
8. 启动服务。第一次要构建网页，约 3–5 分钟
9. 创建你的登录账号（会问邮箱和密码，只存在本机）、研究助手和定时任务，然后用 Safari 打开 <http://localhost:2026>

装完运行一次自检，每一项都应该显示正常：

```bash
bash market-desk/mac/deskctl.sh selftest
```

### 第 4 步（另一种方式）：手动逐步安装

如果你想自己控制每一步，下面这些命令和一键安装做的事情相同：

```bash
make check                                        # 检查 Node 22+、pnpm、uv、nginx
make install                                      # 安装前后端依赖
make setup                                        # 设置向导：模型、搜索、本机执行（bash 选 yes）
bash market-desk/desk.sh configure --lang zh      # 打开定时任务、助手接口等开关，中文
bash market-desk/mac/deskctl.sh keys              # 输入或补充密钥（输入时不显示）
python3 market-desk/ui/apply_ui.py                # 应用中文界面
bash market-desk/mac/install.sh                   # 桌面图标 + 开机自启动 + desk 命令
bash market-desk/mac/deskctl.sh start             # 启动（第一次会构建网页）
python3 market-desk/setup/seed.py                 # 登录账号 + 研究助手 + 定时任务
```

用手动方式安装时，记得先按下面「自选股」一节建好 `market-desk/library/watchlist.yaml`。

### 第 5 步：选择运行方式

| 方式 | 命令 | 适合 |
|---|---|---|
| **正式模式**（默认） | `bash market-desk/mac/deskctl.sh start` | 日常使用。网页预先构建好，打开很快；在后台运行，可以关掉终端 |
| **开发模式** | `bash market-desk/mac/deskctl.sh dev` | 修改界面代码。改完自动刷新，但每个页面第一次打开要编译，较慢；终端要一直开着，按 Ctrl-C 停止 |

- 设定开机时用哪种方式：`bash market-desk/mac/deskctl.sh mode prod` 或 `mode dev`。
- 想直接用 `make dev` 或 `make start` 也可以，但要先做两件事：
  1. 运行 `bash market-desk/mac/deskctl.sh free`，停掉后台正在运行的服务，否则会提示端口 8001 已被占用
  2. 运行 `bash market-desk/mac/deskctl.sh data`，启动行情和研报数据服务（`make` 不会启动它）
- 正式模式下修改了界面代码，`deskctl.sh restart` 会自动重新构建网页。

启动后会占用这些端口（只在本机可以访问）：`2026` 网页入口、`3000` 前端、`8001` 后端、`2027` 数据服务。

### 第 6 步：开机自动打开

一键安装已经设置好了：

- 登录 Mac 后会自动打开一个终端窗口，按你设定的方式启动服务，先把页面预热一遍，再用 Safari 打开 <http://localhost:2026>。
- 桌面上有 **📈 股市故事**（双击启动并打开）和 **股市故事 工具**（改密钥、编辑自选股、重启、看日志等）。
- 第一次运行时，macOS 可能会询问是否允许「终端」控制「System Events」或 Safari，请点**允许**。

调整或关闭：

| 想要 | 怎么做 |
|---|---|
| 换浏览器 | 编辑 `market-desk/mac/settings.env`，例如改成 `BROWSER_APP="Google Chrome"` |
| 只装图标，不要开机启动 | `bash market-desk/mac/install.sh --no-autostart` |
| 暂时关闭开机启动 | 系统设置 → 通用 → 登录项，移除「股市故事 自动启动」 |
| 完全卸载图标、开机启动和 `desk` 命令 | `bash market-desk/mac/install.sh --uninstall`（研报和设置不受影响） |
| 单独补装（手动安装时） | `bash market-desk/mac/install.sh` |

安装后，新开的终端窗口里可以用简写 `desk`，例如 `desk restart`，等同于 `bash market-desk/mac/deskctl.sh restart`。

### 第 7 步：更换模型、搜索或密钥

- **在网页里改**：左下角「API 密钥」页可以填写或替换密钥、切换搜索服务，然后点「保存并重启」。
- **在终端里改**：
  - 输入密钥：`deskctl.sh keys`
  - 检查密钥是否有效：`deskctl.sh keys test`
  - 切换搜索服务：`deskctl.sh search <名称>`
  - 改完之后重启：`deskctl.sh restart`
- **换模型**：重新运行 `make setup`，或者编辑 `config.yaml` 里的 `models:` 一节（`deskctl.sh config` 会打开它），然后 `deskctl.sh restart`。
- **忘记密码**：`bash market-desk/mac/deskctl.sh reset-password`

### 更新到新版本

```bash
git pull
python3 market-desk/ui/apply_ui.py
bash market-desk/mac/deskctl.sh restart          # 界面有变化时会自动重新构建网页，约 3–5 分钟
bash market-desk/mac/deskctl.sh seed --update    # 可选：用新版默认助手和定时任务覆盖旧的
```

### 自选股

编辑 `market-desk/library/watchlist.yaml`，每行一只：

```yaml
a_shares:
  - 600519 贵州茅台 | 消费龙头，股息与估值锚
hong_kong:
  - hk00700 腾讯控股 | 平台 / 回购
```

也可以在任意股票页点「加入自选」。

---

## 常用命令

所有命令都在项目文件夹里运行：

| 命令 | 作用 |
|---|---|
| `bash market-desk/mac/deskctl.sh start` | 启动 |
| `bash market-desk/mac/deskctl.sh restart` | 重启（改了配置或密钥之后） |
| `bash market-desk/mac/deskctl.sh stop` | 停止 |
| `bash market-desk/mac/deskctl.sh status` | 现在在运行什么，下一个定时任务是什么 |
| `bash market-desk/mac/deskctl.sh selftest` | 全面自检，告诉你哪里需要修 |
| `bash market-desk/mac/deskctl.sh keys` | 输入或替换 API 密钥 |
| `bash market-desk/mac/deskctl.sh seed --update` | 重新安装默认助手和定时任务 |
| `bash market-desk/mac/deskctl.sh backup` | 备份研报库到 `~/MarketDesk-backups` |
| `bash market-desk/mac/deskctl.sh logs` | 查看日志 |
| `bash market-desk/mac/deskctl.sh dev` | 开发模式（改界面代码时用，热更新） |
| `bash market-desk/mac/deskctl.sh github` | 提交并推送到你的 GitHub |

---

## 遇到问题

先看网页里的 **系统状态** 页（左下角），或者运行：

```bash
bash market-desk/mac/deskctl.sh selftest
```

| 现象 | 怎么办 |
|---|---|
| 页面打不开 / 端口被占用 | `bash market-desk/mac/deskctl.sh free`，然后 `… restart` |
| 行情显示「—」 | 系统会自动改用备用连接；仍不行就检查网络、VPN 或代理 |
| 定时任务「上次运行失败」 | 打开任务看错误信息；多数是 API 密钥失效或余额不足，用 `… keys test` 检查 |
| 页面顶部提示「后台数据服务还是旧版本」 | 点提示里的「立即修复」，或运行 `… restart` |

---

## 数据与隐私

- 研报存在 `market-desk/library/reports/年/月/*.md`，是普通 Markdown，可以用任何编辑器打开。
- 预测记录在 `market-desk/library/calls.csv`，投资逻辑在 `market-desk/library/theses/`。
- 删除的研报先进「回收站」，可以恢复。
- 每周自动备份研报库（可在系统状态页设置）。
- `.env`（API 密钥）、对话数据库、日志和研报库**默认都不会**被提交到 Git。

---

## 项目结构

```
market-desk/
  library/        研报库：研报、自选股、预测记录、投资逻辑、事件日历
  dashboard/      本地数据服务（行情、研报索引、项目、设置、健康检查）
  setup/          默认助手与定时任务（desk.json + agents/*.md）
  ui/             中文界面与设计系统
  mac/            启动、自启动、自检、备份、发布脚本
  screenshots/    本 README 用到的截图
skills/custom/    研究技能：行情数据、研报规范、个股、财报、对比、行业、宏观、公告、日历、投资逻辑、审稿
```

---

## 致谢

本项目基于字节跳动开源的 **[DeerFlow](https://github.com/bytedance/deer-flow)**（Deep Exploration and Efficient Research Flow）二次开发。它提供了多智能体、技能、沙箱、定时任务和网页框架。原项目的版权和 MIT 许可证见 [LICENSE](LICENSE)。

## 作者

顾恒 Eric Gu · [arteliers.work](https://arteliers.work) · [eric@arteliers.work](mailto:eric@arteliers.work)

本项目以 MIT 许可证发布，见 [LICENSE](LICENSE)。

> 研报由 AI 生成，仅供研究参考，不构成投资建议。
