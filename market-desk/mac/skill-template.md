---
name: __NAME__
description: __DESCRIPTION__
---

# __NAME__

<!-- How to write a good skill:
  - The description above decides WHEN the agent loads this skill. Name the tasks and phrases
    that should trigger it ("earnings preview", "财报前瞻"), max 1024 characters, no angle brackets.
  - The body decides HOW it does the work. Steps, a template, and rules beat general advice.
  - To pull live prices, call the market-data skill's script:
      python3 /mnt/skills/custom/market-data/scripts/market_data.py quote 600519
  - Save reports to /mnt/library/reports/YYYY/MM/YYYY-MM-DD-<slug>.md with front matter
    (title, date, type, tickers, confidence, summary) so the dashboard lists them.
  - Run `desk check` after editing. Delete this comment when done. -->

## When to use

-

## Steps

1.
2.
3.

## Output template

```markdown
---
title: ""
date: YYYY-MM-DD
type: note
tickers: []
confidence: medium
summary: ""
---

# Title

**Bottom line:**

## Sources
```

## Rules

- Every number has a source and an as-of time.
- Save to `/mnt/library/reports/YYYY/MM/` and copy to `/mnt/user-data/outputs/`.
