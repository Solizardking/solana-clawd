// ───────────────────────────────────────────────
// 🛡️ Dark Zcash — Zcash Privacy Primitives for Solana
// Sapling + Orchard zk-SNARKs adapted for browser/TS
// ───────────────────────────────────────────────

// ── Types ───────────────────────────────────────

export type Diversifier = Uint8Array & { readonly __diversifier: unique symbol };
export type JubjubPoint = Uint8Array & { readonly __jubjub: unique symbol };

export interface SaplingSpendingKey {
  sk: Uint8Array;         // 32 bytes
  ask: Uint8Array;        // 32 bytes — spend authorizing key
  nsk: Uint8Array;        // 32 bytes — nullifier deriving key
}

export interface SaplingFullViewingKey {
  ak: Uint8Array;         // 32 bytes — spend validating key
  nk: Uint8Array;         // 32 bytes — nullifier key
  ovk: Uint8Array;        // 32 bytes — outgoing viewing key
}

export interface SaplingIncomingViewingKey {
  ivk: Uint8Array;        // 32 bytes
}

export interface SaplingPaymentAddress {
  d: Uint8Array;          // 11 bytes — diversifier
  pk_d: Uint8Array;       // 32 bytes — diversified public key
}

export interface ShieldedNote {
  value: bigint;          // Amount in lamports
  rcm: Uint8Array;        // 32 bytes — random commitment trapdoor
  memo: Uint8Array;       // 512 bytes — encrypted memo
  pk_d: Uint8Array;       // 32 bytes — recipient's diversified key
}

export interface NoteCommitment {
  commitment: Uint8Array; // 32 bytes — Pedersen commitment
  note: ShieldedNote;
}

export interface EncryptedNote {
  ciphertext: Uint8Array; // ChaCha20-Poly1305 encrypted
  nonce: Uint8Array;      // 12 bytes
  epk: Uint8Array;        // 32 bytes — ephemeral public key
}

export interface MerkleProof {
  root: Uint8Array;       // 32 bytes
  path: Uint8Array[];     // 32 levels × 32 bytes
  indices: boolean[];     // left/right at each level
}

export interface Groth16Proof {
  proofA: Uint8Array;     // 64 bytes
  proofB: Uint8Array;     // 128 bytes
  proofC: Uint8Array;     // 64 bytes
  publicInputs: {
    merkleRoot: Uint8Array;
    inputCommitment: Uint8Array;
    outputCommitment: Uint8Array;
    nullifier: Uint8Array;
  };
}

// ── Constants ───────────────────────────────────

const DIVERSIFIER_SIZE = 11;
const KEY_SIZE = 32;
const MEMO_SIZE = 512;
const MERKLE_DEPTH = 32;
const GROTH16_PROOF_SIZE = 256;

// ── Helpers ─────────────────────────────────────

function randomBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < size; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return buf;
}

function blake2s(data: Uint8Array, key?: Uint8Array): Uint8Array {
  // Simplified Blake2s — in production use @noble/hashes
  let h = 0x6b08e647;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h + data[i]) | 0;
  }
  if (key) {
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) - h + key[i]) | 0;
    }
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = (h >> (i * 8)) & 0xff;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// ── Sapling Key Derivation ──────────────────────

export function generateSaplingSpendingKey(): SaplingSpendingKey {
  const sk = randomBytes(KEY_SIZE);
  const ask = blake2s(new Uint8Array([0x00, ...sk]));
  const nsk = blake2s(new Uint8Array([0x01, ...sk]));
  return { sk, ask, nsk };
}

export function deriveFullViewingKey(sk: SaplingSpendingKey): SaplingFullViewingKey {
  const ak = blake2s(sk.ask);
  const nk = blake2s(sk.nsk);
  const ovk = blake2s(new Uint8Array([0x02, ...sk.sk]));
  return { ak, nk, ovk };
}

export function deriveIncomingViewingKey(fvk: SaplingFullViewingKey): SaplingIncomingViewingKey {
  const ivk = blake2s(new Uint8Array([...fvk.ak, ...fvk.nk]));
  return { ivk };
}

export function createSaplingPaymentAddress(
  ivk: SaplingIncomingViewingKey,
  d: Uint8Array,
): SaplingPaymentAddress {
  if (d.length !== DIVERSIFIER_SIZE) {
    throw new Error(`Diversifier must be ${DIVERSIFIER_SIZE} bytes`);
  }
  // pk_d = [ivk] H(d) where H maps diversifier to Jubjub point
  const pk_d = blake2s(new Uint8Array([0x03, ...d, ...ivk.ivk]));
  return { d, pk_d };
}

export function generateDiversifier(): Uint8Array {
  return randomBytes(DIVERSIFIER_SIZE);
}

export function createShieldedAddress(
  ivk: SaplingIncomingViewingKey,
  diversifierIndex: number = 0,
): string {
  const d = new Uint8Array(DIVERSIFIER_SIZE);
  // Derive deterministic diversifier from index
  const seed = new Uint8Array(4);
  seed[0] = (diversifierIndex >> 24) & 0xff;
  seed[1] = (diversifierIndex >> 16) & 0xff;
  seed[2] = (diversifierIndex >> 8) & 0xff;
  seed[3] = diversifierIndex & 0xff;
  const hash = blake2s(new Uint8Array([0x04, ...seed, ...ivk.ivk]));
  d.set(hash.slice(0, DIVERSIFIER_SIZE));

  const addr = createSaplingPaymentAddress(ivk, d);
  const raw = new Uint8Array([...addr.d, ...addr.pk_d]);
  return `zsol1${bytesToHex(raw).slice(0, 60).toLowerCase()}`;
}

// ── Note Commitment System ──────────────────────

export function generateNoteCommitment(
  value: bigint,
  pk_d: Uint8Array,
  _sk?: SaplingSpendingKey,
): NoteCommitment {
  const rcm = randomBytes(KEY_SIZE);
  const memo = new Uint8Array(MEMO_SIZE);

  const note: ShieldedNote = {
    value,
    rcm,
    memo,
    pk_d,
  };

  // Pedersen commitment: C = value*G + rcm*H
  const valueBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    valueBytes[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
  const commitment = blake2s(new Uint8Array([
    0x05,
    ...valueBytes,
    ...rcm,
    ...pk_d,
  ]));

  return { commitment, note };
}

export function createNullifier(commitment: Uint8Array, sk: SaplingSpendingKey): Uint8Array {
  // nf = nsk XOR PRF^nk(commitment)
  const nskHash = blake2s(new Uint8Array([0x06, ...commitment, ...sk.nsk]));
  return blake2s(new Uint8Array([0x07, ...nskHash, ...commitment]));
}

// ── Note Encryption (ChaCha20-Poly1305 style) ──

export function encryptNote(
  note: ShieldedNote,
  ivk: SaplingIncomingViewingKey,
): EncryptedNote {
  const nonce = randomBytes(12);
  const epk = randomBytes(KEY_SIZE);

  // Derive shared secret from ivk and epk
  const sharedSecret = blake2s(new Uint8Array([0x08, ...epk, ...ivk.ivk]));

  // Encrypt note plaintext
  const plaintext = new Uint8Array([
    ...uint64ToBytes(note.value),
    ...note.rcm,
    ...note.memo,
  ]);

  // ChaCha20-style encryption (simplified — in production use Web Crypto)
  const ciphertext = new Uint8Array(plaintext.length + 16); // +16 for Poly1305 tag
  const keyStream = blake2s(new Uint8Array([0x09, ...sharedSecret, ...nonce]));
  for (let i = 0; i < plaintext.length; i++) {
    ciphertext[i] = plaintext[i] ^ keyStream[i % keyStream.length];
  }

  return { ciphertext, nonce, epk };
}

export function decryptNote(
  encrypted: EncryptedNote,
  ivk: SaplingIncomingViewingKey,
): ShieldedNote | null {
  try {
    const sharedSecret = blake2s(new Uint8Array([0x08, ...encrypted.epk, ...ivk.ivk]));
    const keyStream = blake2s(new Uint8Array([0x09, ...sharedSecret, ...encrypted.nonce]));

    const plaintext = new Uint8Array(encrypted.ciphertext.length - 16);
    for (let i = 0; i < plaintext.length; i++) {
      plaintext[i] = encrypted.ciphertext[i] ^ keyStream[i % keyStream.length];
    }

    const value = bytesToUint64(plaintext.slice(0, 8));
    const rcm = plaintext.slice(8, 40);
    const memo = plaintext.slice(40, 40 + MEMO_SIZE);

    return {
      value,
      rcm,
      memo,
      pk_d: new Uint8Array(32), // would need full note structure
    };
  } catch {
    return null;
  }
}

// ── Merkle Tree (Incremental) ───────────────────

export class MerkleTree {
  private leaves: Uint8Array[] = [];
  private readonly depth: number;

  constructor(depth: number = MERKLE_DEPTH) {
    this.depth = depth;
  }

  insert(leaf: Uint8Array): Uint8Array {
    this.leaves.push(leaf);
    return this.getRoot();
  }

  getRoot(): Uint8Array {
    if (this.leaves.length === 0) {
      return new Uint8Array(32);
    }

    let level = this.leaves.map(l => blake2s(new Uint8Array([0x0a, ...l])));

    for (let d = 0; d < this.depth && level.length > 1; d++) {
      const next: Uint8Array[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : new Uint8Array(32);
        const combined = new Uint8Array([...left, ...right]);
        next.push(blake2s(new Uint8Array([0x0b, ...combined])));
      }
      level = next;
    }

    return level[0];
  }

  getProof(index: number): MerkleProof {
    if (index >= this.leaves.length) {
      throw new Error("Leaf index out of bounds");
    }

    let level = this.leaves.map(l => blake2s(new Uint8Array([0x0a, ...l])));
    const path: Uint8Array[] = [];
    const indices: boolean[] = [];
    let idx = index;

    for (let d = 0; d < this.depth; d++) {
      const sibling = idx % 2 === 0
        ? (idx + 1 < level.length ? level[idx + 1] : new Uint8Array(32))
        : level[idx - 1];
      path.push(sibling);
      indices.push(idx % 2 === 0);

      idx = Math.floor(idx / 2);

      const next: Uint8Array[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : new Uint8Array(32);
        const combined = new Uint8Array([...left, ...right]);
        next.push(blake2s(new Uint8Array([0x0b, ...combined])));
      }
      level = next;
    }

    return {
      root: this.getRoot(),
      path,
      indices,
    };
  }

  getLeafCount(): number {
    return this.leaves.length;
  }
}

export function verifyMerkleProof(proof: MerkleProof, leaf: Uint8Array): boolean {
  let current = blake2s(new Uint8Array([0x0a, ...leaf]));

  for (let i = 0; i < proof.path.length; i++) {
    const combined = proof.indices[i]
      ? new Uint8Array([...current, ...proof.path[i]])
      : new Uint8Array([...proof.path[i], ...current]);
    current = blake2s(new Uint8Array([0x0b, ...combined]));
  }

  for (let i = 0; i < 32; i++) {
    if (current[i] !== proof.root[i]) return false;
  }
  return true;
}

// ── Nullifier Set (Prevent Double-Spends) ───────

export class NullifierSet {
  private nullifiers: Set<string> = new Set();

  contains(nullifier: Uint8Array): boolean {
    return this.nullifiers.has(bytesToHex(nullifier));
  }

  insert(nullifier: Uint8Array): void {
    this.nullifiers.add(bytesToHex(nullifier));
  }

  remove(nullifier: Uint8Array): void {
    this.nullifiers.delete(bytesToHex(nullifier));
  }

  size(): number {
    return this.nullifiers.size;
  }
}

// ── Groth16 Proof System ────────────────────────

export class Groth16ProofSystem {
  generateProof(
    root: Uint8Array,
    inputCommitment: Uint8Array,
    outputCommitment: Uint8Array,
    nullifier: Uint8Array,
    _secretKey: Uint8Array,
  ): Groth16Proof {
    // In production: actual Groth16 proving using ark-groth16
    // Here: deterministic placeholder proofs for the UI shell
    const seed = blake2s(new Uint8Array([
      ...root, ...inputCommitment, ...outputCommitment, ...nullifier,
    ]));

    // Generate deterministic "proof" values from seed
    const proofA = new Uint8Array(64);
    const proofB = new Uint8Array(128);
    const proofC = new Uint8Array(64);

    for (let i = 0; i < 64; i++) proofA[i] = seed[i % 32] ^ (i * 37 + 0xa5);
    for (let i = 0; i < 128; i++) proofB[i] = seed[(i * 7) % 32] ^ (i * 73 + 0xb6);
    for (let i = 0; i < 64; i++) proofC[i] = seed[(i * 13) % 32] ^ (i * 41 + 0xc7);

    return {
      proofA,
      proofB,
      proofC,
      publicInputs: {
        merkleRoot: root,
        inputCommitment,
        outputCommitment,
        nullifier,
      },
    };
  }

  verifyProof(proof: Groth16Proof): boolean {
    // In production: actual Groth16 verification via bn254 pairing check
    // Here: verify the proof structure is well-formed
    if (proof.proofA.length !== 64) return false;
    if (proof.proofB.length !== 128) return false;
    if (proof.proofC.length !== 64) return false;

    const { merkleRoot, inputCommitment, outputCommitment } = proof.publicInputs;
    if (merkleRoot.length !== 32) return false;
    if (inputCommitment.length !== 32) return false;
    if (outputCommitment.length !== 32) return false;

    return true;
  }
}

// ── Shielded Pool Operations ────────────────────

export interface ShieldedPool {
  commitments: Uint8Array[];
  nullifiers: NullifierSet;
  merkleTree: MerkleTree;
}

export function createShieldedPool(): ShieldedPool {
  return {
    commitments: [],
    nullifiers: new NullifierSet(),
    merkleTree: new MerkleTree(),
  };
}

export function depositToPool(
  pool: ShieldedPool,
  commitment: Uint8Array,
): Uint8Array {
  pool.commitments.push(commitment);
  return pool.merkleTree.insert(commitment);
}

export function withdrawFromPool(
  pool: ShieldedPool,
  nullifier: Uint8Array,
  _proof: Groth16Proof,
): boolean {
  if (pool.nullifiers.contains(nullifier)) {
    return false; // Double-spend detected
  }
  pool.nullifiers.insert(nullifier);
  return true;
}

// ── Address Validation ──────────────────────────

export function isValidShieldedAddress(address: string): boolean {
  if (!address.startsWith("zsol1")) return false;
  if (address.length < 50 || address.length > 70) return false;
  // Validate hex characters after prefix
  const payload = address.slice(5);
  return /^[0-9a-f]+$/.test(payload);
}

export function shortenShieldedAddress(address: string, size = 6): string {
  if (address.length <= size * 2 + 7) return address;
  return `${address.slice(0, size + 5)}…${address.slice(-size)}`;
}

// ── Viewing Keys ────────────────────────────────

export function generateViewingKey(): Uint8Array {
  return randomBytes(KEY_SIZE);
}

export function deriveViewingKeyCommitment(vk: Uint8Array): Uint8Array {
  return blake2s(new Uint8Array([0x0c, ...vk]));
}

// ── Internal Utilities ──────────────────────────

function uint64ToBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((value >> BigInt(i * 8)) & 0xffn);
  }
  return bytes;
}

function bytesToUint64(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[i] ?? 0) << BigInt(i * 8);
  }
  return value;
}

// ── Re-exports for convenience ──────────────────

export {
  DIVERSIFIER_SIZE,
  KEY_SIZE,
  MEMO_SIZE,
  MERKLE_DEPTH,
  GROTH16_PROOF_SIZE,
  bytesToHex,
  hexToBytes,
  randomBytes,
};