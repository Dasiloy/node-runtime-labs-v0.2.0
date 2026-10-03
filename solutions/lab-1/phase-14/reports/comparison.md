# Flight Recorder Comparison

Inputs:
- `reports/copy.json`
- `reports/view.json`

Baseline: `reports/copy.json`

Baseline command: `/usr/bin/env node --import file:///nodebook-labs-workspace/lab-1/phase-14/src/probe/register.js /nodebook-labs-workspace/lab-1/phase-14/fixtures/buffer-copy.js`

| Metric | Report | Baseline | Value | Delta | Delta % |
| --- | --- | ---: | ---: | ---: | ---: |
| Duration (ms) | `reports/view.json` | 403.81 | 384.52 | -19.29 | -4.78% |
| Peak RSS (bytes) | `reports/view.json` | 163602432 | 88702976 | -74899456 | -45.78% |
| Peak heap used (bytes) | `reports/view.json` | 5269536 | 5269536 | 0 | 0.00% |
| Peak external (bytes) | `reports/view.json` | 90017450 | 14519978 | -75497472 | -83.87% |
| Peak array buffers (bytes) | `reports/view.json` | 88103167 | 12605731 | -75497436 | -85.69% |
| Total CPU (micros) | `reports/view.json` | 36003 | 7879 | -28124 | -78.12% |
| Max event loop delay (ms) | `reports/view.json` | 10.13 | 10.90 | 0.77 | 7.60% |
| Exit code | `reports/view.json` | 0 | 0 | 0 | n/a |
| Warnings | `reports/view.json` | 0 | 0 | 0 | n/a |
| Fatal failures | `reports/view.json` | 0 | 0 | 0 | n/a |

## Top Differences

- Peak array buffers (bytes) in `reports/view.json`: -75497436 (-85.69%)
- Peak external (bytes) in `reports/view.json`: -75497472 (-83.87%)
- Total CPU (micros) in `reports/view.json`: -28124 (-78.12%)
- Peak RSS (bytes) in `reports/view.json`: -74899456 (-45.78%)
- Max event loop delay (ms) in `reports/view.json`: 0.77 (7.60%)
- Duration (ms) in `reports/view.json`: -19.29 (-4.78%)
- Peak heap used (bytes) in `reports/view.json`: 0 (0.00%)
- Exit code in `reports/view.json`: 0 (n/a)

## Run Notes

- `reports/copy.json`: exit 0, timedOut false, warnings 0, fatal failures 0
- `reports/view.json`: exit 0, timedOut false, warnings 0, fatal failures 0
