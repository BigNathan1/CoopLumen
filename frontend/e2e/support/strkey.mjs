/**
 * Stellar StrKey encoding for the E2E helpers, with no dependencies:
 * a version byte, the payload, and a CRC16-XModem checksum, in RFC 4648 base32.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const VERSION_ACCOUNT = 6 << 3;
export const VERSION_SEED = 18 << 3;

function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Encodes a 32-byte key as a StrKey (`G...` for accounts, `S...` for seeds). */
export function encodeStrKey(version, payload) {
  const body = Buffer.concat([Buffer.from([version]), payload]);
  const checksum = crc16(body);
  return base32(Buffer.concat([body, Buffer.from([checksum & 0xff, checksum >> 8])]));
}
