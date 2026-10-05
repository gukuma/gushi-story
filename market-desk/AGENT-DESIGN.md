# 股市故事 研究团队设计（2026-10）

## 参考了哪些开源设计

| 项目 | 核心做法 | 我们借鉴了什么 |
|---|---|---|
| TradingAgents（Tauric Research）及中文版 TradingAgents-CN | 分析师团队（基本面 / 情绪 / 新闻 / 技术）→ 多空研究员辩论 → 交易员 → 风控团队 → 基金经理；用结构化报告而不是长对话传递信息，避免“传话失真” | 个股深度的四个分析视角 + 多空对辩 + 裁判；数据底稿文件代替长对话；风控审稿人 |
| FinRobot（AI4Finance） | Data-CoT → Concept-CoT → Thesis-CoT 三段式，产出机构格式研报（财务、竞争、风险、DCF / 市盈率估值） | “数据 → 分析 → 结论”的分段；情景估值；标准化研报格式 |
| Dexter（virattt） | 计划 → 执行 → 自我验证 → 回答，带循环检测和步数上限，全程留草稿日志 | 动手前写计划；交付前自检清单（最多三轮）；中间底稿放 workspace |
| ai-hedge-fund（virattt） | 多位“投资大师”人格 + 估值 / 基本面 / 情绪 / 技术分析代理，风险经理与组合经理汇总；把分歧当作信息 | 反方观点必须是最强版本；分歧要写出来而不是抹平 |
| Anthropic 金融服务插件（equity-research） | 首次覆盖、财报点评 / 前瞻、晨会纪要、投资逻辑跟踪、催化剂日历、行业概览、选股 | 新增财报点评、投资逻辑跟踪、催化剂日历、对比研究四类研报 |
| ValueCell | DeepResearch（文件分析）+ 定时新闻推送 + 策略代理 | 定时任务分工：日历、公告、审稿 |
| Deep FinResearch Bench（评测） | AI 研报常见问题：套用通用模板、前后矛盾、假设无依据、只有单点估计、10–34% 引用无法核实 | 研报规范的行业专属指标表、一致性检查、情景表、引用规则 |

## 现在的团队（中文）

| 助手 | 角色 | 主要技能 | 定时任务 |
|---|---|---|---|
| 首席分析师 `market-analyst-zh`（默认） | 日常问答、每日简报，按需调用全部技能 | 全部 | 盘前简报 08:45、收盘复盘 15:45（工作日） |
| 个股研究员 `stock-researcher-zh` | 个股深度、财报、投资逻辑 | ashare-equity-research-zh、earnings-review-zh、thesis-tracker-zh、peer-compare-zh | 投资逻辑周检（周三 20:00）、自选股深度（周日 20:30） |
| 行业研究员 `research-analyst-zh` | 行业规模、产业链、对比 | market-sizing-zh、peer-compare-zh | — |
| 宏观策略师 `macro-strategist-zh` | 宏观、政策、周报、预测验证建议 | weekly-macro-review-zh、catalyst-calendar-zh | 周报（周六 10:30） |
| 事件监控员 `announcement-watcher-zh` | 公告、日历、财报前瞻 | announcement-watch-zh、catalyst-calendar-zh、earnings-review-zh | 公告扫描（工作日 18:30）、催化剂日历（周一 07:30） |
| 风控审稿人 `risk-reviewer-zh` | 红队审稿、预测验证建议 | report-review-zh、thesis-tracker-zh | 周度审稿（周日 21:30） |

所有助手共用 `research-standard-zh`（研报规范）：YAML 头、要点先行、数字溯源、情景表、反方观点、行业专属指标、交付前自检、保存命名、预测记录。

## 研报类型

daily-brief 简报 · announcements 公告速览 · weekly-review 周报 · equity-research 个股深度 · earnings 财报点评 · market-sizing 行业研究 · compare 对比研究 · thesis 投资逻辑 · calendar 催化剂日历 · review 审稿意见 · note 笔记

活文件：`/mnt/library/theses/<代码>.md`（投资逻辑）、`/mnt/library/calendar.md`（日历）、`/mnt/library/calls.csv`（预测记录）。

## 应用

```bash
bash market-desk/mac/deskctl.sh seed --update   # 创建 / 更新助手和定时任务
```
