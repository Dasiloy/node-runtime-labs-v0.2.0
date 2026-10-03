# NLOG Record Format

The segment file stores records one after another. Each record starts with a
28-byte fixed header. The payload starts immediately after that header.

## Header

| Offset | Width | Field | Encoding |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `NLOG` |
| 4 | 1 | version | unsigned integer, currently `1` |
| 5 | 1 | record type | `1` for `PUT`, `2` for `DELETE` |
| 6 | 2 | reserved | zero-filled |
| 8 | 4 | key length | unsigned 32-bit big-endian byte length |
| 12 | 4 | value length | unsigned 32-bit big-endian byte length |
| 16 | 8 | timestamp | unsigned 64-bit big-endian Unix epoch milliseconds |
| 24 | 4 | checksum | unsigned 32-bit big-endian CRC-32 with these bytes zeroed |

`HEADER_SIZE` is `28`, so payload bytes start at offset `28`.

## Payload

Payload bytes are stored as:

1. key bytes
2. value bytes

Keys and values are UTF-8 bytes. Length fields store byte counts, not
JavaScript string lengths.

`PUT` records contain key bytes and value bytes. `DELETE` records contain key
bytes and a zero-length value.
