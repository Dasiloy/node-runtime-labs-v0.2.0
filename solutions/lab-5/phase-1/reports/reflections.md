## Phase 0

File watching needs an initial view of the directory because an event only says something happened after watching began. It also needs verification after each event because raw watcher records vary by platform and editor save strategy.

## Phase 1

The initial scan and live watch events need to feed the same inventory model because events are prompts, not final state. The scanner records the state the tool can compare, report, cache, and rebuild from.
