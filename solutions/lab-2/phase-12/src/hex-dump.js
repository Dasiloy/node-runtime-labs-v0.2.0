export function hexDump(buffer, { bytesPerRow = 16 } = {}) {
  const lines = [];

  for (let rowOffset = 0; rowOffset < buffer.length; rowOffset += bytesPerRow) {
    const row = buffer.subarray(rowOffset, rowOffset + bytesPerRow);
    const hex = Array.from(row, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
    lines.push(`${rowOffset.toString(16).padStart(8, "0")}  ${hex}`);
  }

  return lines.join("\n");
}
