# Vendored SheetJS Community Edition

- Package: `xlsx`
- Version: **0.20.3**
- Official source: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
  (SheetJS CE is distributed from cdn.sheetjs.com; it is no longer published to npm after 0.18.5)
- Tarball SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- `xlsx.mjs` SHA-256: `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`
  (verified byte-identical to `package/xlsx.mjs` in the official tarball)
- Embedded version marker: `XLSX.version = '0.20.3'` (src/vendor/xlsx/xlsx.mjs line 6)
- License: Apache-2.0, retained in `./LICENSE`
- Verified: 2026-09-20

Why vendored: it replaces the vulnerable npm `xlsx@0.18.5` direct dependency.
Parsing stays client-side in `src/lib/spreadsheet-import.ts`; no remote runtime
script loading, no formula evaluation, no HTML output.

To re-verify:

```sh
curl -sSL -o /tmp/xlsx.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
sha256sum /tmp/xlsx.tgz
tar xzf /tmp/xlsx.tgz -C /tmp && cmp /tmp/package/xlsx.mjs src/vendor/xlsx/xlsx.mjs
```
