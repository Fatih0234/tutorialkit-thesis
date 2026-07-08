# Optional package snippets

Only use these if your target project does not already have Playwright configured.

## Add Playwright dependency

```bash
pnpm add -D @playwright/test
pnpm exec playwright install
```

## Run POC tests

```bash
TK_POC_URL=http://localhost:4321 pnpm exec playwright test e2e/interactive-poc.spec.ts
```

## Suggested package.json script

```json
{
  "scripts": {
    "test:interactive-poc": "playwright test e2e/interactive-poc.spec.ts"
  }
}
```
