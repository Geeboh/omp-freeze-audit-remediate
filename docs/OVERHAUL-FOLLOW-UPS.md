# FAR follow-ups after core overhaul

## M7 learning and root-cause assistance

1. Add provenance-bearing local observation records for repeated failure signatures.
2. Test bounded retrieval and export with learning disabled and with cross-project export disabled.
3. Keep retrieved lessons advisory only. Policy, approvals and release gates remain authoritative.

## M8 evidence-driven optimization

1. Benchmark snapshot hashing, JSON ledger load, pagination and concurrent reservations on 100, 1,000 and 10,000-record fixtures.
2. Compare p50/p95, RSS, bytes read, lock contention and verified work at concurrency 1, 2 and 4.
3. Change storage or caching only when paired measurements show a maintained invariant-preserving benefit.
