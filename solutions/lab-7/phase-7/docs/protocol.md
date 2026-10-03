# Custom Binary Protocol

All numeric fields use big-endian byte order. Request ids are unsigned
64-bit integers. Event, ACK, and error frame payloads are UTF-8 JSON. Heartbeat
frames use an empty payload.

## Header Layout

| Offset | Width | Field | Type | Meaning | Validation rule |
| ---: | ---: | --- | --- | --- | --- |
| 0 | 4 | magic | ASCII bytes | Protocol marker | Must equal `NBGW` |
| 4 | 1 | version | `uint8` | Wire format version | Must equal `1` |
| 5 | 1 | frame type | `uint8` | Payload routing value | Must be `1` EVENT, `2` HEARTBEAT, `3` ACK, or `4` ERROR |
| 6 | 2 | flags | `uint16be` | Extension flags | Must equal `0` until a later extension defines flags |
| 8 | 8 | request id | `uint64be` | Unsigned request id | Must fit in an unsigned 64-bit integer |
| 16 | 4 | payload length | `uint32be` | Number of payload bytes after the header | Must be less than or equal to `1_048_576` |
| 20 | 4 | checksum | `uint32be` | CRC32 integrity value | Must equal the CRC32 rule below |
| 24 | ... | payload | bytes | Frame-specific payload bytes | UTF-8 JSON for EVENT, ACK, and ERROR frames; empty for HEARTBEAT |

## Frame Types

| Value | Name | Payload |
| ---: | --- | --- |
| 1 | EVENT | UTF-8 JSON event object |
| 2 | HEARTBEAT | Empty |
| 3 | ACK | UTF-8 JSON acknowledgement object |
| 4 | ERROR | UTF-8 JSON error object |

## Checksum

The checksum is the CRC32 value for the complete frame bytes with header bytes
`20..23` set to zero. The input to the CRC is the fixed 24-byte header followed
by the payload bytes. The sender writes zero into the checksum field, computes
CRC32 over those bytes, then writes the computed value back at offset `20`.

The receiver repeats the same calculation against the received bytes while
treating offset `20..23` as zero. A mismatch rejects the frame before the payload
is accepted.
