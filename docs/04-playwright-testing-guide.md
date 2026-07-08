# Playwright Testing Guide

The POC should be testable through visible debug controls.

## Required debug controls

Use accessible names so Playwright can find them:

- `Start Recording`
- `Stop Recording`
- `Play Recording`
- `Pause`
- `Save Learner Delta`
- `Restore Learner Delta`

## Suggested selectors

Editor:

```ts
const editor = page.locator('.cm-content').first();
```

Controls:

```ts
page.getByRole('button', { name: /start recording/i })
```

localStorage:

```ts
const raw = await page.evaluate(() =>
  localStorage.getItem('interactive-poc.teacherRecording')
);
```

## Required tests

1. recording captures an edit
2. playback applies an edit
3. learner delta saves after pause/edit
4. learner delta restores after reset/replay

## Keep tests resilient

Do not assert exact CSS structure where accessible controls exist.
Do not require exact TutorialKit demo content.
Prefer checking localStorage shape and visible editor content.
