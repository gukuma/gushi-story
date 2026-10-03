# API keys for the Market Desk

Run `desk keys` (or **Market Desk Tools → Set API keys…**) to paste them in. Input is hidden,
they're saved to `.env` (permissions 600), and `desk keys test` checks them. Restart afterwards.

The market data itself (prices, FX, macro, crypto) needs **no keys**.

## What you actually need

| Priority | Key | Why | Cost |
|---|---|---|---|
| **Required** | `DEEPSEEK_API_KEY` | The model that writes every report | Pay per token; new accounts get a small trial balance |
| **Strongly recommended** | `TAVILY_API_KEY` | Web search that works far better than the default DuckDuckGo | 1,000 searches/month free, no card |
| Recommended for China work | `TENCENTCLOUD_WSA_APIKEY` | Best coverage of mainland Chinese sites | Paid; needs Tencent Cloud real-name verification |
| Optional | `INFOQUEST_API_KEY` | ByteDance's search + page reader | See BytePlus pricing |
| Optional | `JINA_API_KEY` | Page reader used by `web_fetch`; works without a key, a key raises the rate limit | Free tier |
| Optional | `LANGSMITH_API_KEY` | Traces every step and token of every run | Free tier |

Only **one** search provider is active at a time. Start with Tavily; switch with
`desk search tencent` (or the Tools menu) once you have the Tencent key, and compare a few briefs.

## Step by step

### 1. DeepSeek (required)
1. Go to **https://platform.deepseek.com** and sign up (email or phone).
2. Left sidebar → **Top up** → add credit. A few US dollars / ¥20–50 covers weeks of daily briefs.
3. Left sidebar → **API keys** → **Create new API key** → name it `deerflow` → copy it now (it's shown once).
4. `desk keys` → paste into `DEEPSEEK_API_KEY` → `desk keys test` should list the models.

### 2. Tavily (search)
1. Go to **https://app.tavily.com** and sign up (Google/GitHub works). No credit card.
2. The dashboard shows a key starting `tvly-` → copy.
3. `desk keys` → `TAVILY_API_KEY`, then `desk search tavily`, then `desk restart`.

### 3. Tencent Cloud WSA (Chinese web search)
1. Sign up at **https://cloud.tencent.com** and complete real-name verification (实名认证). As a foreign
   national you'll verify with a passport; this can take a day.
2. Open the WSA console **https://console.cloud.tencent.com/wsapi/index** → **开通服务** (enable service)
   and buy a package.
3. In the console overview, under **服务 API KEY 方式**, click **创建 API KEY**, name it, and copy / download
   it immediately (shown once; max 3 keys per account).
   Use this service API key, **not** the SecretId/SecretKey pair from the CAM page.
4. `desk keys` → `TENCENTCLOUD_WSA_APIKEY`, then `desk search tencent`, then `desk restart`.

### 4. BytePlus InfoQuest (optional)
1. Sign up at **https://console.byteplus.com**.
2. Follow **https://docs.byteplus.com/en/docs/InfoQuest/What_is_Info_Quest** → "Managing API keys" to
   create a key (the docs also list the free quota).
3. `desk keys` → `INFOQUEST_API_KEY`, then `desk search infoquest`.

### 5. Jina Reader (optional)
1. **https://jina.ai/reader** → "API key" — a free key is generated on the page.
2. `desk keys` → `JINA_API_KEY`.

### 6. LangSmith tracing (optional)
1. **https://smith.langchain.com** → sign up → Settings → **API Keys** → create.
2. `desk keys` → `LANGSMITH_API_KEY` (it also sets `LANGSMITH_TRACING=true`).

### Alternative model: Volcengine Ark
One key for Doubao, DeepSeek, Kimi and GLM, billed in RMB: **https://console.volcengine.com/ark** →
API Key management → create. Pick "Volcengine Doubao" or "Volcengine Coding Plan" in `make setup`.

## Keeping keys safe

- Keys live only in `.env` in the repo folder. `desk backup` deliberately leaves `.env` out.
- Don't paste keys into chats with the agent or into skills.
- If a key leaks, delete it in that provider's console and create a new one.
