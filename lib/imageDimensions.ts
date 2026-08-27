/**
 * Reads real width/height from raw image bytes by parsing file headers directly.
 * No image library dependency — just enough of the PNG and JPEG spec to get
 * true dimensions, so we never have to guess or claim a resolution we didn't verify.
 */
export function readImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: signature (8 bytes) + IHDR chunk starting at byte 8, width/height are
  // big-endian uint32 at offsets 16 and 20.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: walk the marker segments looking for a Start-Of-Frame (SOF) marker,
  // which stores height/width as big-endian uint16 right after the segment length.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSOF) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height };
      }
      const segmentLength = buf.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }

  // WebP (VP8/VP8L/VP8X) — best-effort for the simple lossy VP8 case.
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
  }

  return null;
}
