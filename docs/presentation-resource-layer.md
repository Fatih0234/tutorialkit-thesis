# Presentation Resource Layer

The immersive workspace can present live website previews, lesson explanation, and snapshot-safe slides as timeline-directed resources. Each resource has one canonical mode: `hidden`, `minimized`, or `focused`. Only one resource may be focused.

## Teacher cues

Preparation establishes the initial presentation layout. At recording start, the resource descriptors and initial layout are copied into the immutable `TeacherRecording`. A deliberate teacher show, hide, minimize, or focus action during recording appends a complete `presentation.changed` layout snapshot. Recording complete state rather than toggle commands makes playback and arbitrary seeking deterministic.

Slides in the first POC use structured inline text rather than external URLs. This makes drafts and exported recordings self-contained. Production image/video assets need the same package asset treatment as recorded media.

## Playback and learner control

Playback materializes presentation events alongside editor events. Seeking restores the initial layout and applies ordered presentation events through the target timestamp.

The learner can change any resource locally. This creates a temporary presentation override only; it does not mutate the teacher recording, create a learner file delta, or mark the workspace dirty. **Follow teacher** clears the override immediately. A later teacher presentation cue also clears the temporary override and applies the teacher's new direction. This gives each teacher cue visible meaning while allowing the learner to close or refocus content between cues.

## Live preview ownership

`PreviewPanel` and its existing WebContainer iframe are reused. In the immersive product the same iframe node is embedded in a persistent presentation host and resized between hidden, minimized, and focused geometry. It is not recreated during those transitions, so its JavaScript state and user interaction survive.

Clicks, DOM mutations, form input, and navigation inside the iframe are deliberately not recorded. The timeline records presentation intent around a live preview, not preview internals. Exact application-interaction replay remains a separate reproducibility and privacy problem.

## Explanation and slides

The explanation resource reads trusted lesson Markdown through the lesson-specific Astro template bridge. It can be presented independently of the docked Explanation context pane. Demo slides are structured recording resources with stable IDs, titles, eyebrow text, and body text.

## Compatibility

The recording additions are optional:

```ts
presentationResources?: PresentationResource[];
initialPresentationLayout?: PresentationLayout;
```

Old recordings default to a hidden presentation layout. Existing storage adapters and package serialization preserve the additive fields without introducing another API or networking path.
