// Node.js script to generate unique Israeli-style 9-digit IDs (8-digit payload + Luhn check digit).
// Usage:
//   node generate_israel_ids.js           -> prints to stdout
//   node generate_israel_ids.js > ids.txt -> saves to ids.txt
// or the script will also write ids.txt automatically.

const fs = require('fs');
const crypto = require('crypto');

const COUNT = 4000;
const OUT_FILE = 'israel_ids_4000.txt';
const ALLOW_LEADING_ZERO = false; // set true if you want payloads that may start with '0'

// compute Luhn-style check digit for payload (string of digits, e.g. 8 digits)
function luhnCheckDigit(payload) {
  const digits = payload.split('').map((d) => parseInt(d, 10));
  const parity = digits.length % 2;
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === parity) {
      d = d * 2;
      if (d > 9) d = d - 9;
    }
    total += d;
  }
  const check = (10 - (total % 10)) % 10;
  return String(check);
}

// generate a random integer in [min, max] inclusive using crypto.randomInt when available
function randInt(min, max) {
  // crypto.randomInt is available in recent Node versions
  return crypto.randomInt(min, max + 1);
}

function genPayload() {
  if (ALLOW_LEADING_ZERO) {
    // generate an 8-digit string that may start with 0
    const n = randInt(0, 99999999);
    return String(n).padStart(8, '0');
  } else {
    // generate 8-digit number with first digit 1-9 (no leading zero)
    const n = randInt(10_000_000, 99_999_999);
    return String(n);
  }
}

function generateUniqueIds(count) {
  const ids = new Set();
  let attempts = 0;
  const MAX_ATTEMPTS = count * 100; // safety cap
  while (ids.size < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const payload = genPayload();
    const check = luhnCheckDigit(payload);
    const full = payload + check;
    ids.add(full);
  }
  if (ids.size < count) {
    throw new Error(`Could not generate ${count} unique ids within ${MAX_ATTEMPTS} attempts`);
  }
  return Array.from(ids);
}

function main() {
  try {
    const ids = generateUniqueIds(COUNT);
    // Optionally sort or shuffle; currently they're in insertion order (random).
    // If you want them shuffled (random order) uncomment below:
    // ids.sort(() => Math.random() - 0.5);

    // Print to stdout (one per line)
    ids.forEach((id) => console.log(id));

    // Also write to file for convenience
    fs.writeFileSync(OUT_FILE, ids.join('\n'), {encoding: 'utf8'});
    console.error(`Wrote ${ids.length} IDs to ./${OUT_FILE}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) main();
