export const pngLogo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=',
  'base64'
)

function jpegSegment(marker: number, data: number[]) {
  const header = Buffer.from([0xff, marker, 0, 0])
  header.writeUInt16BE(data.length + 2, 2)
  return Buffer.concat([header, Buffer.from(data)])
}

// One grayscale pixel: one DC-zero / AC-EOB block, with one-bit Huffman codes.
export const jpegLogo = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  jpegSegment(0xdb, [0, ...Array<number>(64).fill(1)]),
  jpegSegment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
  jpegSegment(0xc4, [0, 1, ...Array<number>(15).fill(0), 0, 0x10, 1, ...Array<number>(15).fill(0), 0]),
  jpegSegment(0xda, [1, 1, 0, 0, 63, 0]),
  Buffer.from([0x3f, 0xff, 0xd9])
])

export const webpLogo = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
export const losslessWebpLogo = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64')

// Solid-color images generated with Pillow; GIF contains two animated frames, ICO is 16x16.
export const gifLogo = Buffer.from('R0lGODlhAQABAIEAABRk3AAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAQABAAAIBAABBAQAIfkEAQoAAQAsAAAAAAEAAQCB3GQUAAAAAAAAAAAACAQAAQQEADs=', 'base64')
export const icoLogo = Buffer.from('AAABAAEAEBAAAAAAIABbAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgCAAAAkJFoNgAAACJJREFUeJxjFEm5w0AKYCJJNcOoBuIAE5Hq4GBUAzGAZA0AQhwBdEfmVP0AAAAASUVORK5CYII=', 'base64')
export const avifLogo = Buffer.from('AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAHQAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAJW1kYXQSAAoFGAAGBCAyEhQAAwwwxAAAeUzeoX5HLEtB6A==', 'base64')
export const bmpLogo = Buffer.from('Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAADEDgAAxA4AAAAAAAAAAAAA3GQUAA==', 'base64')

export const additionalLogos = [
  { buffer: gifLogo, contentType: 'image/gif', extension: '.gif', width: 1, height: 1 },
  { buffer: icoLogo, contentType: 'image/vnd.microsoft.icon', extension: '.ico', width: 16, height: 16 },
  { buffer: avifLogo, contentType: 'image/avif', extension: '.avif', width: 1, height: 1 },
  { buffer: bmpLogo, contentType: 'image/bmp', extension: '.bmp', width: 1, height: 1 }
] as const
