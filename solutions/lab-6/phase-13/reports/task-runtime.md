# Task Runtime Benchmark

- Command: npm run bench
- Node: v24.15.0
- Platform: linux
- CPU count: 24
- Task mix: deterministic delay, timeout, flaky retry, and mixed-result mode scenarios.

| Scenario | Duration ms | Throughput/s | Success | Failed | Timed out | Canceled | Retries | Queue avg ms | Queue p95 ms | Max active | Stop reason |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| concurrency-1 | 1231.7 | 32.47 | 40 | 0 | 0 | 0 | 0 | 598.2 | 1134.0 | 1 |  |
| concurrency-5 | 253.9 | 157.56 | 40 | 0 | 0 | 0 | 0 | 107.3 | 213.0 | 5 |  |
| concurrency-20 | 89.8 | 445.44 | 40 | 0 | 0 | 0 | 0 | 15.7 | 32.0 | 20 |  |
| timeout-none | 103.6 | 28.95 | 3 | 0 | 0 | 0 | 0 | 0.0 | 0.0 | 3 |  |
| timeout-short | 33.0 | 90.83 | 1 | 0 | 2 | 0 | 0 | 0.0 | 0.0 | 3 |  |
| retry-disabled | 3.3 | 302.75 | 0 | 1 | 0 | 0 | 0 | 0.0 | 0.0 | 1 |  |
| retry-enabled | 14.2 | 70.43 | 1 | 0 | 0 | 0 | 1 | 13.0 | 13.0 | 1 |  |
| mode-all | 35.6 | 140.43 | 0 | 1 | 0 | 2 | 0 | 12.4 | 31.0 | 3 | first_failure |
| mode-allSettled | 283.7 | 17.62 | 3 | 2 | 0 | 0 | 0 | 22.2 | 80.0 | 3 |  |
| mode-race | 34.3 | 145.90 | 0 | 1 | 0 | 2 | 0 | 12.4 | 31.0 | 3 | first_settled |
| mode-any | 84.8 | 58.99 | 1 | 1 | 0 | 2 | 0 | 22.4 | 81.0 | 3 | first_success |

Concurrency changes queue time and throughput because the scheduler admits more active attempts before waiting for completions.
Timeout and retry scenarios change outcome counts and latency because attempts can end early or run again after backoff.
Mode scenarios change how much work starts before the aggregate result is decided.
