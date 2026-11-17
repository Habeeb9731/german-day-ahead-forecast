# Ask depower

A small Cloudflare Worker behind the dashboard's chat. It answers questions about depower and the German power market with Claude Haiku, using the project README (`src/knowledge.js`) plus a live summary of `/data/tomorrow.json` and `/data/track_record.json` built on each request.

It runs only on `depower.abdulhabeeb.com/api/ask`; every other request goes to the origin unchanged.

## Guardrails

- Only requests from the site (Origin check), questions up to 300 characters, the last 4 turns of history.
- 5 questions per visitor per day (salted hash of the IP), 40 a day overall, counted in KV.
- Haiku returns `on_topic`; off-topic answers are dropped by the Worker.
- The Anthropic key lives in a workspace with a monthly spend limit.
- An owner token (`x-ask-owner`) skips the limits and isn't logged.

## Update and deploy

```bash
npm install
npm run knowledge          # after the README changes
cf deploy --secrets-file /path/outside/the/repo/secrets.env
```

The secrets file holds `ANTHROPIC_API_KEY`, `IP_SALT` and `ASK_OWNER_TOKEN`. Never commit it.
