# Module Inspector Report

## Summary

- Traces: 10
- Resolved: 8
- Failed: 2
- Warnings: 1
- Errors: 3

## Traces

### trace-01: `./local`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/app/src/local.js`

### trace-02: `./missing`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `failed`
- Errors:
  - `missing-file`: Unable to resolve path specifier ./missing
  - `missing-directory-entry`: No file, extension probe, or directory entry matched ./missing

### trace-03: `node:fs`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `resolved`
- Resolved: `node:fs`

### trace-04: `pkg-main`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/app/node_modules/pkg-main/dist/index.cjs`
- Format: `cjs`

### trace-05: `pkg-main-broken`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/app/node_modules/pkg-main-broken/index.js`
- Format: `cjs`

### trace-06: `pkg-exports/feature`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/app/node_modules/pkg-exports/dist/feature.js`
- Format: `cjs`
- Export: `./feature` -> `./dist/feature.js`

### trace-07: `pkg-exports/internal.js`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `failed`
- Errors:
  - `ERR_PACKAGE_PATH_NOT_EXPORTED`: pkg-exports does not export ./internal.js

### trace-08: `pkg-esm`

- Importer: `fixtures/generated/app/src/index.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/app/node_modules/pkg-esm/index.js`
- Format: `esm`
- Warnings:
  - `require-esm-namespace`: Treat the return value as an ESM namespace and check whether the target uses top-level await.

### trace-09: `pkg-shadow`

- Importer: `fixtures/generated/app/src/nested/consumer.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/app/src/nested/node_modules/pkg-shadow/index.cjs`
- Format: `cjs`

### trace-10: `pkg-linked`

- Importer: `fixtures/generated/workspace/app/src/index.cjs`
- Status: `resolved`
- Resolved: `fixtures/generated/workspace/app/node_modules/pkg-linked/index.cjs`
- Format: `cjs`

## Graph Edges

- `fixtures/generated/cycles/a.cjs` -> `fixtures/generated/cycles/b.cjs`
- `fixtures/generated/cycles/b.cjs` -> `fixtures/generated/cycles/a.cjs`

## Cycles

- `fixtures/generated/cycles/a.cjs` -> `fixtures/generated/cycles/b.cjs` -> `fixtures/generated/cycles/a.cjs`

## Symlinks

- `resolved-path-realpath-differ`: `fixtures/generated/workspace/app/node_modules/pkg-linked/index.cjs` -> `fixtures/generated/workspace/packages/pkg-linked/index.cjs`
- `preserve-symlinks-identity`: `fixtures/generated/workspace/app/node_modules/pkg-linked/index.cjs` -> `fixtures/generated/workspace/packages/pkg-linked/index.cjs`

## Timeline

- `trace-01` classify: ./local used path branch
- `trace-02` classify: ./missing used failed branch
- `trace-02` error: missing-file
- `trace-02` error: missing-directory-entry
- `trace-03` classify: node:fs used builtin branch
- `trace-04` classify: pkg-main used package branch
- `trace-04` metadata: package.json found
- `trace-04` metadata: type selected
- `trace-04` metadata: main selected
- `trace-05` classify: pkg-main-broken used package branch
- `trace-05` metadata: package.json found
- `trace-05` metadata: type selected
- `trace-05` metadata: main selected
- `trace-05` metadata: main invalid
- `trace-05` metadata: fallback selected
- `trace-06` classify: pkg-exports/feature used package branch
- `trace-06` metadata: package.json found
- `trace-06` metadata: type selected
- `trace-06` metadata: exports present
- `trace-06` metadata: exports-match selected
- `trace-07` classify: pkg-exports/internal.js used failed branch
- `trace-07` metadata: package.json found
- `trace-07` metadata: type selected
- `trace-07` metadata: exports present
- `trace-07` error: ERR_PACKAGE_PATH_NOT_EXPORTED
- `trace-08` classify: pkg-esm used package branch
- `trace-08` metadata: package.json found
- `trace-08` metadata: type selected
- `trace-08` metadata: main selected
- `trace-08` warning: require-esm-namespace
- `trace-09` classify: pkg-shadow used package branch
- `trace-09` metadata: package-lookup closest-package-wins
- `trace-09` metadata: package.json found
- `trace-09` metadata: type selected
- `trace-09` metadata: main selected
- `trace-10` classify: pkg-linked used package branch
- `trace-10` metadata: package.json found
- `trace-10` metadata: type selected
- `trace-10` metadata: main selected
- `runtime` runtime-cache: loaded 3 modules
