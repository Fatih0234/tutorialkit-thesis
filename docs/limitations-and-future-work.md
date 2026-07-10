# Limitations and future work

## Interpretation

This project is a thesis proof of concept for the interactivity boundary, not a production learning platform. Its result should be evaluated as evidence that immutable teacher replay and recoverable learner-owned work can coexist behind clear storage and ownership seams.

## Current limitations

### Demo authentication only

Identity uses fixed development users and file-backed server sessions. It has no passwords, OAuth/OIDC, email verification, MFA, account recovery, organization model, or production authorization administration. The cookie/session design demonstrates server-derived ownership but is not sufficient production authentication.

### `.interactive-data/` is not a production database

Published recordings, learner deltas, media metadata, binaries, and sessions use gitignored local files. This is reproducible for development and thesis demonstration but does not supply transactions, replication, backups, operational monitoring, migrations, concurrent-write guarantees, or production retention policies.

### No production object storage

Media Blob values live in browser IndexedDB for drafts or local `.interactive-data/media-assets/` files for published demo lessons. There is no cloud/object-store upload flow, signed URL strategy, transcoding pipeline, CDN, quota system, or lifecycle policy.

### No automated merge

Conflict detection reports later teacher edits that touch learner-changed files. Resolution is an explicit learner choice to restore, keep the teacher state, inspect details, or cancel. The system does not automatically merge content and does not persist a separate resolution decision.

### File-level deltas only

`LearnerDelta` stores complete contents of added/modified files plus removed paths. It does not store text patches, syntax-aware operations, change hunks, collaborative operations, or CRDT state. Restore currently updates existing TutorialKit workspace files; full file-tree add/remove restoration is not a finished product feature.

### No terminal recording

Commands, terminal output, process state, and shell timing are outside the recording schema. The timeline covers editor/file interactions and optional media only.

### No iframe or preview-internal recording

Interactions inside a rendered application preview are not captured. The system does not inspect iframe internals, replay DOM interactions, or record browser input within the learner's application.

### No analytics

There is no telemetry, event warehouse, engagement tracking, learning-outcome measurement, or privacy/consent workflow. Runtime timeline events are lesson replay artifacts, not analytics events.

### No formal user study yet

The current evidence consists of architecture documentation, deterministic demonstrations, and automated functional tests. It does not yet include participant recruitment, ethics/consent materials, task protocols, usability metrics, interviews, qualitative coding, or statistically supported learning outcomes.

### Additional prototype constraints

- Export format version 1 is JSON/base64 and is not a stable public package API.
- There is no archive streaming, checksum manifest, or package migration framework.
- The editor player supports deterministic seeking, but has no production-grade speed, drift correction, captions, or advanced media controls.
- Recording selectors and status panels are thesis-demo UI, not a final design system.
- No transcript generation, screen capture, experiment naming, marker deletion, or dedicated checkpoint-version chooser exists.
- LocalStorage parsing and the file-backed backend assume controlled POC data.

## Future work

### Production identity and authorization

Replace demo login with a production identity provider and server-side authorization policy while preserving the current rule that ownership comes from authenticated server context. Define teacher collaboration, lesson ownership transfer, learner sharing, administrative access, session rotation, and audit requirements.

### Durable persistence and media infrastructure

Implement a production adapter behind `InteractiveTimelineStorage`: durable database records for immutable recordings and learner deltas, object storage for media, checksums, quotas, retention, backup/restore, and transactional publication. React and workspace behavior should remain independent of the backend technology.

### Richer but still safe learner change handling

Add experiment naming, marker deletion, checkpoint-version selection, changed-file summaries, and side-by-side comparison with the historical teacher base. Patch/hunk deltas or optional merge assistance should be evaluated only as separate advanced workflows; normal lecture playback must continue to ignore learner branches and preserve both source artifacts.

### Playback and media controls

Build on the deterministic editor seek implementation with playback speed, drift correction, cancellation, captions/transcripts, media processing, and accessibility evaluation. Structured events should remain the authoritative replay representation even if richer media is attached.

### Broader interaction capture

Study terminal and preview interaction schemas only after the editor/file model is stable. Terminal capture requires command/output security and environment reproducibility; iframe capture requires cross-origin, privacy, and deterministic replay decisions. Neither should be treated as a small extension to the current event model.

### Stable package format

If packages become a product feature, define schema migration, content checksums, size limits, archive/streaming representation, trust boundaries, malware/content validation, and explicit collision/overwrite policies. Keep import-as-copy as the safest default.

### Formal evaluation

Design a user study with separate teacher and learner tasks. Candidate measures include recording completion, replay comprehension, learner confidence that experiments are recoverable, timeline-marker comprehension, task time, error rates, usability scales, and qualitative feedback. Establish consent, privacy, data minimization, participant sampling, and analysis methods before collecting study data.

### Product and accessibility refinement

Conduct keyboard, screen-reader, color/contrast, responsive-layout, empty-state, and error-recovery studies. Replace debug-oriented status density with progressive disclosure while retaining an evidence mode suitable for diagnosis and teaching demonstrations.
