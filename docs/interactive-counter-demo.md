# Interactive Counter product demo

## Open the lecture

Run the E2E tutorial app:

```bash
pnpm -C e2e run dev
```

Open:

```text
http://localhost:4329/tests/file-tree/interactive-counter
```

This fixture is intentionally separate from `lesson-and-solution`. The older counter recording remains a deterministic regression fixture; `interactive-counter` is the polished workspace for recording a public demo.

## What is prepared

The starter workspace contains:

- `/example.html` — accessible counter interface
- `/example.js` — working increment behavior and two learner challenges
- `/styles.css` — camera-ready counter preview
- `/server.mjs` — local preview server
- `/tutorialkit-pointer-bridge.js` — opt-in normalized cursor bridge for preview playback

The built-in TutorialKit solution completes decrement and reset. Do not press **Solve** while recording the learner challenge; use it only while rehearsing or demonstrating the teacher solution.

## Suggested 6–8 minute teacher lecture

### 0:00–0:40 — Set the goal

> We are going to connect three ideas: state, rendering, and user events. Increment already works. Your challenge will be to finish decrement and reset safely.

Open the Website Preview and click Increment twice.

### 0:40–2:00 — Explain state and rendering

Open `/example.js`. Point to `let count = 0` and `render()`.

> State is the value JavaScript remembers. Rendering copies that value into the interface. Keeping those jobs separate makes every button handler small and predictable.

Open the counter slide deck. Reveal “Read the current value” and “Increment it after every click,” then minimize the deck.

### 2:00–3:15 — Trace the working event

Walk through the increment listener:

```js
incrementButton.addEventListener('click', () => {
  count += 1;
  render();
});
```

Focus the Website Preview and show that each click updates the visible number.

### 3:15–4:15 — Set the learner challenge

Point to the two TODO comments.

> Pause the lecture here. Implement decrement, but do not let the value become negative. Then make Reset return the value to zero. Test both behaviors in the preview and save your experiment.

Recommended AI prompt after explicitly attaching the decrement selection:

> Give me a hint for preventing a counter from becoming negative. Explain the idea without writing the complete handler.

### 4:15–5:30 — Reveal the teacher solution

After the learner segment, record the solution:

```js
count = Math.max(0, count - 1);
render();
```

and:

```js
count = 0;
render();
```

Test Increment, Decrement at zero, and Reset in the preview.

### 5:30–6:15 — Summarize

> Events change state, and rendering synchronizes the interface. The important part of this lesson is also how you learned: you paused a deterministic teacher timeline, experimented in your own workspace, requested contextual help, and returned without either version being lost.

## Product-video sequence

1. Select **Teacher Demo** and record 30–60 seconds of the lecture live.
2. Stop, review, save, and publish the recording.
3. Switch to **Learner Demo** and start the published lesson.
4. Play and seek through editor and presentation events.
5. Pause at the challenge and enter **My Workspace**.
6. Implement one handler and show the live preview.
7. Explicitly attach selected code to the AI Helper and send the suggested prompt.
8. Save the experiment and return to the teacher timeline.
9. Show the teacher solution, then reopen the learner checkpoint.

The key closing message is: **the teacher timeline stays immutable while learner work remains recoverable.**
