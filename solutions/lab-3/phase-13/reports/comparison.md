# Stream Processing Workbench Comparison

| Scenario | Mode | Input bytes | Output bytes | Rows | Matches | Elapsed ms | Peak RSS | Peak heap | Peak external | Drains | Output | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| naive-default | naive | 1075872 | 81932 | 5000 | 381 | 10 | 94806016 | 4893240 | 3861920 | 0 | baseline | reports/naive-default.json |
| stream-default | stream | 1075872 | 81932 | 5000 | 381 | 31 | 96501760 | 5856896 | 2046499 | 0 | match | reports/stream-default.json |
| pressure-default | pressure | 1075872 | 81932 | 5000 | 381 | 39 | 96784384 | 6129272 | 2055581 | 1 | n/a | reports/pressure-default.json |
| pressure-slow-5ms | pressure | 1075872 | 81932 | 5000 | 381 | 37 | 96403456 | 6079816 | 2055581 | 1 | n/a | reports/pressure-slow-5ms.json |
| stream-gzip | stream | 1075872 | 27234 | 5000 | 381 | 31 | 97488896 | 7085536 | 2292483 | 0 | match | reports/stream-gzip.json |
| stream-low-read-hwm | stream | 1075872 | 81932 | 5000 | 381 | 2750 | 95723520 | 7458768 | 1897825 | 0 | match | reports/stream-low-read-hwm.json |
| pressure-large-write-hwm | pressure | 1075872 | 81932 | 5000 | 381 | 34 | 96604160 | 6086464 | 2055581 | 1 | n/a | reports/pressure-large-write-hwm.json |

Equivalent outputs use decompressed logical content for gzip scenarios.

Production rule: use the streaming processor for unbounded or user-supplied input, keep filters before transforms, and enable gzip only when the measured byte reduction is worth the added transform stage for the current sink.
