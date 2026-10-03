## Phase 0

File watching needs an initial view of the directory because an event only says something happened after watching began. It also needs verification after each event because raw watcher records vary by platform and editor save strategy.
