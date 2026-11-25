# FAR follow-ups after core overhaul

## M7 learning and root-cause assistance

Implemented in this increment.

- Local observations are compact, redacted, bounded and disabled by default.
- Lessons move from proposed to validated only with observation and validation references.
- Root-cause groups retain original findings and acceptance evidence.
- Structural assessment tasks are read-only review tasks with bounded paths.
- Export is versioned JSON, local-only and sanitized.
- NOESIS remains unavailable because no verified interface is configured. No adapter or upload is enabled.

Next M7 task is to re-evaluate a real verified NOESIS interface if one becomes available. Keep explicit data-sharing scope and do not add a service dependency.

## M8 evidence-driven optimization

Implemented in this increment.

- `docs/M8-MEASUREMENT.json` records five alternating samples on a 1,000-file fixture.
- `docs/M8-DECISION.md` records no SQLite, cache, dashboard or concurrency change.
- Re-measure at larger fixture sizes before changing the storage or hashing design.
