import { Buffer } from "node:buffer";

/**
 * You are interfacing with a legacy piece of hardware that mixes Big-Endian and Little-Endian byte orders within the same data packet. You could parse this with Buffer read methods, but this exercise uses DataView so each field's byte order is explicit.

The Protocol Specification

The packet is 16 bytes long.

Offset (Bytes)	Length (Bytes)	Data Type	Endianness	Description
0-1	2	UInt16	Big	Packet Signature, must be 0xCAFE
2-5	4	Int32	Little	Device ID
6-9	4	Float32	Big	Voltage Reading
10	1	UInt8	N/A	Status Code
11	1	UInt8	N/A	Checksum
12-15	4	UInt32	Little	Uptime in seconds
Your Task
Write a function parseLegacyPacket(buffer) that takes a 16-byte Buffer. Inside it, create a DataView over the Buffer's underlying ArrayBuffer using the Buffer's byteOffset and byteLength -

javascript

Copy
new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
Use DataView methods such as getUint16, getInt32, and getFloat32 to parse the packet according to the specification. The final boolean argument controls endianness - true for little-endian, false for big-endian.

Sample Data

javascript

Copy
const legacyPacket = Buffer.from([
  0xca, 0xfe, // Packet signature (BE)
  0xad, 0xde, 0x00, 0x00, // Device ID: 57005 (LE)
  0x40, 0xa0, 0x00, 0x00, // Voltage: 5.0 (BE)
  0x01, // Status: 1 (OK)
  0xb5, // Checksum
  0x80, 0x51, 0x01, 0x00, // Uptime: 86400 (LE)
]);
The Goal

Your parseLegacyPacket(legacyPacket) function should return an object that looks like this -

json

Copy
{
  "signature": 51966,
  "deviceId": 57005,
  "voltage": 5,
  "status": 1,
  "checksum": 181,
  "uptime": 86400
}
Things to Consider

How do you get the underlying ArrayBuffer from a Buffer to create a DataView? Every Buffer instance has a .buffer property.
Be careful with byteOffset. A small Buffer may share a larger pooled ArrayBuffer, so the DataView should use buffer.byteOffset and buffer.byteLength even when the Buffer is not an explicit slice.
The third argument to DataView methods is the endianness flag. false, or omitted, is Big-Endian. true is Little-Endian. You will need to use both.
The parser should make every offset, width, and byte-order choice explicit.
 */

const legacyPacket = Buffer.from([
  0xca,
  0xfe, // Packet signature (BE)
  0xad,
  0xde,
  0x00,
  0x00, // Device ID: 57005 (LE)
  0x40,
  0xa0,
  0x00,
  0x00, // Voltage: 5.0 (BE)
  0x01, // Status: 1 (OK)
  0xb5, // Checksum
  0x80,
  0x51,
  0x01,
  0x00, // Uptime: 86400 (LE)
]);

function parseLegacyPacket(packet: Buffer<ArrayBuffer>) {
  if (packet.length !== 16) {
    throw new RangeError("Invalid byte length");
  }

  const dataview = new DataView(
    packet.buffer,
    packet.byteOffset,
    packet.byteLength,
  );

  return {
    signature: dataview.getUint16(0, false),
    deviceId: dataview.getInt32(2, true),
    voltage: dataview.getFloat32(6, false),
    status: dataview.getUint8(10),
    checksum: dataview.getUint8(11),
    uptime: dataview.getUint32(12, true),
  };
}

console.log(parseLegacyPacket(legacyPacket));
