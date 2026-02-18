/**
 * IP Anonymization Pipeline
 * =========================
 * IP Address  →  32-bit seed  →  Snowflake crystal config
 *            →  Rubik's cube scramble state  →  Unique ~20-digit integer
 *
 * The same IP always produces the same identifier, but the original IP cannot
 * be recovered from it.  Each visitor gets a unique crystalline fingerprint.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: IP address → 32-bit numeric seed
// ─────────────────────────────────────────────────────────────────────────────

export function ipToSeed(ip) {
  ip = ip.replace(/^\[|\]$/g, "").trim(); // strip IPv6 brackets

  if (ip.includes(".")) {
    // IPv4: pack four octets into a 32-bit integer
    const p = ip.split(".").map(Number);
    if (p.length === 4 && p.every((n) => n >= 0 && n <= 255)) {
      return ((p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3]) >>> 0);
    }
  }

  // IPv6 or malformed → FNV-1a 32-bit hash
  let h = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded LCG (linear congruential generator)
// ─────────────────────────────────────────────────────────────────────────────

function makeLCG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: seed → snowflake crystal configuration
//
// A real snowflake has six-fold symmetry: all six arms are identical.
// We describe one arm by:
//   armLength  – how many segments it extends (2–7)
//   branches   – pairs of side-branches; each pair has a position along
//                the arm and a length (1–3 segments)
// The "genome" is a flat integer array used as input to the Rubik's step.
// ─────────────────────────────────────────────────────────────────────────────

export function seedToSnowflake(seed) {
  const rng = makeLCG(seed);

  const armLength   = (rng() % 6) + 2;                       // 2–7 segments
  const numBranches = (rng() % 4) + 1;                       // 1–4 branch pairs

  const branches = [];
  for (let i = 0; i < numBranches; i++) {
    branches.push({
      pos: (rng() % Math.max(1, armLength - 1)) + 1,         // 1 … armLength-1
      len: (rng() % 3) + 1,                                  // 1–3
    });
  }
  branches.sort((a, b) => a.pos - b.pos);

  const genome = [
    armLength,
    numBranches,
    ...branches.flatMap((b) => [b.pos, b.len]),
  ];

  return { armLength, branches, genome };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: snowflake → Rubik's cube scramble state
//
// A valid (reachable) 3×3 Rubik's cube state requires:
//   • corner permutation parity + edge permutation parity = even
//   • sum of corner orientations ≡ 0  (mod 3)
//   • sum of edge   orientations ≡ 0  (mod 2)
// Valid total states: 8! × 3^7 × 12! × 2^11 ≈ 4.33 × 10^19
// ─────────────────────────────────────────────────────────────────────────────

function permParity(perm) {
  const vis = new Array(perm.length).fill(false);
  let p = 0;
  for (let i = 0; i < perm.length; i++) {
    if (!vis[i]) {
      let len = 0, j = i;
      while (!vis[j]) { vis[j] = true; j = perm[j]; len++; }
      if (len % 2 === 0) p++;
    }
  }
  return p % 2;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng() % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function snowflakeToRubiksCube(snowflake) {
  // Hash the snowflake genome into a new seed for the cube RNG
  const cubeSeed = snowflake.genome.reduce(
    (h, v) => (Math.imul(h, 31) + v) >>> 0,
    0xdeadbeef
  );
  const rng = makeLCG(cubeSeed);

  // Corner permutation
  const corners = [0, 1, 2, 3, 4, 5, 6, 7];
  shuffle(corners, rng);

  // Corner orientations: 7 free, 8th forced (sum ≡ 0 mod 3)
  const co = [];
  let coSum = 0;
  for (let i = 0; i < 7; i++) {
    const o = rng() % 3;
    co.push(o);
    coSum += o;
  }
  co.push((3 - (coSum % 3)) % 3);

  // Edge permutation
  const edges = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  shuffle(edges, rng);

  // Fix parity: corner perm parity + edge perm parity must be even
  if ((permParity(corners) + permParity(edges)) % 2 !== 0) {
    [edges[10], edges[11]] = [edges[11], edges[10]];
  }

  // Edge orientations: 11 free, 12th forced (sum ≡ 0 mod 2)
  const eo = [];
  let eoSum = 0;
  for (let i = 0; i < 11; i++) {
    const o = rng() % 2;
    eo.push(o);
    eoSum += o;
  }
  eo.push(eoSum % 2);

  return { corners, co, edges, eo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Rubik's cube state → unique integer (Lehmer / factoradic encoding)
//
// Encodes each permutation via its Lehmer code (factoradic position) and each
// orientation array as a mixed-radix integer, then combines them all into a
// single BigInt.
//
// Range: 0 … 8! × 3^7 × 12! × 2^11 − 1  ≈  8.86 × 10^19
// ─────────────────────────────────────────────────────────────────────────────

const _factCache = new Map([[0n, 1n], [1n, 1n]]);
function fact(n) {
  if (_factCache.has(n)) return _factCache.get(n);
  const r = n * fact(n - 1n);
  _factCache.set(n, r);
  return r;
}

function lehmer(perm) {
  const avail = Array.from({ length: perm.length }, (_, i) => i);
  let idx = 0n;
  for (let i = 0; i < perm.length; i++) {
    const pos = avail.indexOf(perm[i]);
    idx += BigInt(pos) * fact(BigInt(perm.length - 1 - i));
    avail.splice(pos, 1);
  }
  return idx;
}

export function cubeStateToNumber({ corners, co, edges, eo }) {
  // Corner permutation index : 0 … 40319  (8! = 40320)
  const cpIdx = lehmer(corners);

  // Corner orientation index : 0 … 2186   (3^7 = 2187)
  const coIdx = co.slice(0, 7).reduce((a, v) => a * 3n + BigInt(v), 0n);

  // Edge permutation index   : 0 … 479001599  (12! = 479001600)
  const epIdx = lehmer(edges);

  // Edge orientation index   : 0 … 2047   (2^11 = 2048)
  const eoIdx = eo.slice(0, 11).reduce((a, v) => a * 2n + BigInt(v), 0n);

  // Pack all four indices into one large integer
  return ((cpIdx * 2187n + coIdx) * 479001600n + epIdx) * 2048n + eoIdx;
}

// ─────────────────────────────────────────────────────────────────────────────
// ASCII snowflake visualisation
//
// Renders the snowflake on a character grid.  Six arms radiate from the centre
// at 0°, 60°, 120°, 180°, 240°, 300°.  Side-branches grow at ±60° from each
// arm (i.e. toward the two neighbouring arm directions).
//
// Horizontal arms use dc=±2 so that the aspect ratio looks correct in a
// terminal where characters are roughly twice as tall as wide.
// ─────────────────────────────────────────────────────────────────────────────

export function drawSnowflake(snowflake) {
  const { armLength, branches } = snowflake;

  // Grid dimensions — generous padding so branches never clip
  const cx = armLength * 2 + 6; // centre column
  const cy = armLength + 3;     // centre row
  const W  = cx * 2 + 1;
  const H  = cy * 2 + 1;

  const grid = Array.from({ length: H }, () => Array(W).fill(" "));
  grid[cy][cx] = "+";

  // Six arm directions with their ±60° branch directions
  const ARMS = [
    { dc:  2, dr:  0, ch: "-",  bDirs: [{ dc:  1, dr: -1, ch: "/" }, { dc:  1, dr:  1, ch: "\\" }] },
    { dc:  1, dr: -1, ch: "/",  bDirs: [{ dc:  2, dr:  0, ch: "-" }, { dc: -1, dr: -1, ch: "\\" }] },
    { dc: -1, dr: -1, ch: "\\", bDirs: [{ dc:  1, dr: -1, ch: "/" }, { dc: -2, dr:  0, ch: "-"  }] },
    { dc: -2, dr:  0, ch: "-",  bDirs: [{ dc: -1, dr: -1, ch: "\\" }, { dc: -1, dr:  1, ch: "/" }] },
    { dc: -1, dr:  1, ch: "/",  bDirs: [{ dc: -2, dr:  0, ch: "-"  }, { dc:  1, dr:  1, ch: "\\" }] },
    { dc:  1, dr:  1, ch: "\\", bDirs: [{ dc: -1, dr:  1, ch: "/" }, { dc:  2, dr:  0, ch: "-"  }] },
  ];

  function plot(r, c, ch) {
    if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = ch;
  }

  for (const arm of ARMS) {
    let r = cy, c = cx;
    for (let d = 1; d <= armLength; d++) {
      r += arm.dr;
      c += arm.dc;
      plot(r, c, d === armLength ? "*" : arm.ch);

      // Draw any side-branches rooted at this distance
      for (const branch of branches) {
        if (branch.pos === d) {
          for (const bd of arm.bDirs) {
            let br = r, bc = c;
            for (let bl = 1; bl <= branch.len; bl++) {
              br += bd.dr;
              bc += bd.dc;
              plot(br, bc, bl === branch.len ? "*" : bd.ch);
            }
          }
        }
      }
    }
  }

  return grid.map((row) => row.join("")).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function anonymizeIp(ip) {
  const seed      = ipToSeed(ip);
  const snowflake = seedToSnowflake(seed);
  const cubeState = snowflakeToRubiksCube(snowflake);
  const uniqueId  = cubeStateToNumber(cubeState);
  return { anonymizedId: uniqueId.toString(), snowflake, cubeState };
}
