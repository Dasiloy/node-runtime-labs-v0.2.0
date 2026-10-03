# Binary Store Benchmark

Generated: 2026-05-21T02:11:00.238Z
Node: v24.15.0
Platform: linux x64
CPUs: 24
Dataset size: 5000
Sync mode: false
Checksums enabled: true

| Case | Duration ms | Operations | Ops/sec |
| --- | ---: | ---: | ---: |
| sequential puts | 1051.94 | 5000 | 4753.14 |
| repeated puts | 1018.22 | 5000 | 4910.51 |
| indexed gets | 216.38 | 2000 | 9243.03 |
| full scan | 222.10 | 5000 | 22512.49 |
| recovery after truncated tail | 449.25 | 1 | 2.23 |
| compaction after overwrites and deletes | 545.95 | 1 | 1.83 |

Segment size: 50000 bytes
Index size: 120593 bytes
RSS: 127524864 bytes
Heap used: 5288864 bytes
External: 1852973 bytes
ArrayBuffers: 33171 bytes
Recovery time: 449.25 ms
Compaction time: 545.95 ms
