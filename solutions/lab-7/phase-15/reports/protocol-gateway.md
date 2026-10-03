# Custom Binary Protocol Gateway Report

Generated at 2026-05-21T02:01:36.645Z.

## Input Files

- docs/protocol.md: present
- reports/load-latest.json: present
- reports/final-report.json: present
- reports/connections.jsonl: present
- reports/protocol-errors.jsonl: present
- reports/metrics.jsonl: present

## Protocol Design

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


The parser keeps one carry buffer per TCP connection. It appends new bytes only when a previous chunk ended before a complete frame, reads the payload length after the fixed header is present, decodes every complete frame in the current receive buffer, and stores only the incomplete tail for the next read.

Malformed input policy is recorded by stable protocol error codes. The latest run observed 1 protocol error records.

## Runtime Behavior

- Connections closed: 65
- Frames observed from connection reports: 11320
- Bytes observed from connection reports: 4160894
- Last gateway framesReceived metric: 9
- Last gateway eventsForwarded metric: 9
- Protocol errors by code: {}

## Backpressure And HTTP

- Max active connections: 48
- Max file buffered bytes: 632660
- Max HTTP queue depth: 0
- Max RSS bytes: 117923840
- Socket pauses: 2
- Socket resumes: 0

## Shutdown Result

- Reason: SIGINT
- Open connections at shutdown: 0
- Dropped frames: 0
- Drained events: 9
- Forced socket closes: 0
- Sink close time ms: 0

## Load Result

- Frames sent: 10000
- Frames accepted by gateway metrics: 9
- Malformed frames injected: 0
- Protocol errors observed: 0
- Bytes sent: 3992500
- Throughput frames/sec: 41319.40
- Throughput bytes/sec: 16496771.82
- ACK count: 0
- ACK timeouts: 0
- ACK latency p50 ms: 0.00
- ACK latency p95 ms: 0.00
- Dropped frames: 0

The systems rule from this lab: a protocol gateway owns every byte boundary, every queue boundary, and every shutdown boundary it creates.