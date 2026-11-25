# M8 decision record

Date: 2026-11-25.

## Verdict

No SQLite, aggressive cache, dashboard or concurrency change.

Existing scoped snapshot selection is sufficient for the measured fixture. Full snapshot hashing is materially more expensive than a declared component scope, but this is already addressed by M4 scope admission and conservative invalidation.

## Measurement

Command:

```bash
node scripts/measure-m8.mjs
```

Environment: Node.js 24.22.3, Linux x64, 16 CPUs. Load average before run was 4.39, 3.26, 3.43. Five alternating samples per side ran on the same temporary Git fixture.

| Workload | Path | Median | Range | Files | Bytes |
|---|---|---:|---:|---:|---:|
| 1,000-file fixture | Full snapshot | 203.212 ms | 195.344 to 225.119 ms | 1,000 | 28,780 |
| 1,000-file fixture | `src` scoped snapshot | 26.936 ms | 25.130 to 31.085 ms | 100 | 2,878 |
| 10,000-file fixture | Full snapshot | 1,834.571 ms | 1,801.956 to 1,915.728 ms | 10,000 | 307,780 |
| 10,000-file fixture | `src` scoped snapshot | 204.943 ms | 200.335 to 225.591 ms | 1,000 | 30,778 |

Scope selection remains roughly an order-of-magnitude reduction at both sizes. Full hashing scales with selected file count. The larger workload confirms a real source-snapshot bottleneck, but the existing scoped path meets the measured local target without a storage rewrite.

Raw JSON is in `docs/M8-MEASUREMENT.json` and `docs/M8-MEASUREMENT-10000.json`. The harness is `scripts/measure-m8.mjs`.

## Limits

This is a deterministic local fixture measurement. It is not a TADA measurement, provider-cost result or production workload. The pack records historical TADA as `NOT_RUN`. No cross-project data, dashboard or new service was introduced.
