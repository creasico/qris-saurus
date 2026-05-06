const CRC_POLY = 0x1021;
const CRC_INIT = 0xffff;

export function computeCrc(input: string): string {
  let crc = CRC_INIT;

  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ CRC_POLY) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function verifyCrc(qrisString: string): boolean {
  const markerIndex = qrisString.lastIndexOf("6304");

  if (markerIndex === -1 || qrisString.length < markerIndex + 8) {
    return false;
  }

  const payload = qrisString.slice(0, markerIndex + 4);
  const actual = qrisString.slice(markerIndex + 4, markerIndex + 8).toUpperCase();

  return computeCrc(payload) === actual;
}
