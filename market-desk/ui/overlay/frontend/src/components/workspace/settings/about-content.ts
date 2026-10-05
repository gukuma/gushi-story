/**
 * About 📈 股市故事 (replaces DeerFlow's about page). Inlined markdown.
 */
import { APP_VERSION } from "@/version";

export const aboutMarkdown = `# 📈 关于 股市故事

股市故事是一个在你自己电脑上运行的 AI 投研助手：每天自动写盘前简报、收盘复盘和周报，
帮你研究 A股、港股和宏观，把所有研报、对话和预测整理在一个地方。

- **今日**：每天早上看一页就够了
- **研报**：所有研报按时间排成收件箱
- **项目**：把同一主题的研报和对话放在一起
- **股票**：搜索任意股票，看最新观点和全部记录

所有数据（研报、笔记、自选股、预测记录）都保存在你电脑的 \`market-desk/library\` 文件夹里，
API 密钥只保存在本机的 \`.env\` 文件里。

---

作者：Eric Gu · [arteliers.work](https://arteliers.work) · [eric@arteliers.work](mailto:eric@arteliers.work)

基于开源框架 DeerFlow ${APP_VERSION} 构建（MIT 许可证）。行情数据来自腾讯财经、新浪财经和 CoinGecko，仅供研究，不构成投资建议。
`;
