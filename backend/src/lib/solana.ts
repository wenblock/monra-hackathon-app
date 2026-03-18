const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_LOOKUP = new Map(BASE58_ALPHABET.split("").map((char, index) => [char, index]));

export function isValidSolanaAddress(value: string) {
  const input = value.trim();

  if (input.length < 32 || input.length > 44) {
    return false;
  }

  try {
    return decodeBase58(input).length === 32;
  } catch {
    return false;
  }
}

function decodeBase58(value: string) {
  const bytes: number[] = [0];

  for (const character of value) {
    const digit = BASE58_LOOKUP.get(character);
    if (digit === undefined) {
      throw new Error("Invalid base58 character.");
    }

    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const current = bytes[index] * 58 + carry;
      bytes[index] = current & 0xff;
      carry = current >> 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const character of value) {
    if (character !== "1") {
      break;
    }

    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}
