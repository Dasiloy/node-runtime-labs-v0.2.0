## Phase 0

File watching needs an initial view of the directory because an event only says something happened after watching began. It also needs verification after each event because raw watcher records vary by platform and editor save strategy.

## Phase 1

The initial scan and live watch events need to feed the same inventory model because events are prompts, not final state. The scanner records the state the tool can compare, report, cache, and rebuild from.

## Phase 2

Path alone is a weak identity because the name can keep pointing at different filesystem objects over time. The device and inode fields describe the current object behind that path, while timestamps, mode, size, and type describe what changed about it.

## Phase 3

A filesystem cache should stream hashes because file size is outside the cache's control. Streaming keeps memory bounded while still feeding every byte into the digest state.

## Phase 4

Cache files need atomic writes because the next run treats the cache as previous truth. Publishing through a same-directory temp file means a reader gets the old complete cache or the new complete cache.

## Phase 5

A metadata change means the directory entry or file attributes changed: timestamps, mode, object identity, size, or type. A content change means the bytes hashed differently, even if some metadata still looks familiar.

## Phase 6

Watch mode is better modeled as a session because it owns resources that stay alive: watcher handles, event buffers, timers, reports, cache state, and shutdown behavior.
