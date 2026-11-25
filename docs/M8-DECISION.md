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

| Path | Median | Range | Files | Bytes |
|---|---:|---:|---:|---:|
| Full snapshot | 203.212 ms | 195.344 to 225.119 ms | 1,000 | 28,780 |
| `src` scoped snapshot | 26.936 ms | 25.130 to 31.085 ms | 100 | 2,878 |

Scoped selection measured about 7.5x lower median wall time while hashing one tenth of fixture inputs. Outputs contained the expected file and byte counts. A diagnostic `strace -c` run showed runtime futex/epoll activity plus per-file `statx`, `openat` and `read` calls. It did not justify a storage replacement.

Raw JSON is in `docs/M8-MEASUREMENT.json`. The harness is `scripts/measure-m8.mjs`.

## Limits

This is a deterministic local fixture measurement. It is not a TADA measurement, provider-cost result or production workload. The pack records historical TADA as `NOT_RUN`. No cross-project data, dashboard or new service was introduced.
