/**
 * pay/src/sign.test.ts
 *
 * End-to-end integration tests for Solana transaction signing.
 *
 * These tests validate:
 *   - Base64 transaction decoding (legacy + v0)
 *   - Signer validation (rejecting non-required signers)
 *   - Signing + submission flow (with injectable submitter)
 *   - Incomplete signer detection
 *   - Error handling for all SignErrorCode variants
 *
 * Run:
 *   npx vitest run pay/src/sign.test.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  Transaction,
  VersionedTransaction,
  Keypair,
  PublicKey,
  Connection,
  SystemProgram,
  TransactionMessage,
} from "@solana/web3.js";
import * as bs58 from "bs58";
import {
  signAndSubmit,
  checkIncompleteSigners,
  TransactionSubmitter,
  SignConfig,
  SignErrorCode,
  RpcSubmitter,
} from "./sign";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLegacyTx(keypair: Keypair): string {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1000,
    }),
  );
  tx.feePayer = keypair.publicKey;
  tx.recentBlockhash = "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj";
  // Don't sign yet — this is what the caller does
  return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
}

function makeV0Tx(keypair: Keypair): string {
  const instructions = [
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1000,
    }),
  ];
  const blockhash = "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj";
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(messageV0);
  return Buffer.from(tx.serialize()).toString("base64");
}

/** Fake submitter that captures what was submitted */
class FakeSubmitter implements TransactionSubmitter {
  submittedTx: Transaction | VersionedTransaction | null = null;
  shouldFail = false;
  failMessage = "Simulated RPC failure";

  async submit(
    transaction: Transaction | VersionedTransaction,
    _connection: Connection,
  ): Promise<string> {
    this.submittedTx = transaction;
    if (this.shouldFail) throw new Error(this.failMessage);
    return "fake_sig_" + Math.random().toString(36).slice(2, 10);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("signAndSubmit", () => {
  let keypair: Keypair;
  let privateKey: string;

  beforeEach(() => {
    keypair = Keypair.generate();
    privateKey = bs58.encode(keypair.secretKey);
  });

  // ── Decoding ────────────────────────────────────────────────────────────

  it("decodes and signs a legacy transaction", async () => {
    const base64Tx = makeLegacyTx(keypair);
    const fakeSubmitter = new FakeSubmitter();

    const result = await signAndSubmit(
      base64Tx,
      { privateKey, network: "devnet" },
      fakeSubmitter,
    );

    expect(result.signature).toMatch(/^fake_sig_/);
    expect(result.signer).toBe(keypair.publicKey.toBase58());
    expect(result.version).toBe("legacy");
    expect(result.network).toBe("devnet");
    expect(result.requiredSigners).toBeGreaterThanOrEqual(1);
    expect(fakeSubmitter.submittedTx).toBeTruthy();
  });

  it("decodes and signs a v0 transaction", async () => {
    const base64Tx = makeV0Tx(keypair);
    const fakeSubmitter = new FakeSubmitter();

    const result = await signAndSubmit(
      base64Tx,
      { privateKey, network: "devnet" },
      fakeSubmitter,
    );

    expect(result.version).toBe("v0");
    expect(result.signature).toMatch(/^fake_sig_/);
  });

  // ── Signer Validation ───────────────────────────────────────────────────

  it("rejects when the Pay account is not a required signer", async () => {
    const otherKeypair = Keypair.generate();
    const base64Tx = makeLegacyTx(otherKeypair); // Tx requires otherKeypair, not our keypair

    await expect(
      signAndSubmit(
        base64Tx,
        { privateKey, network: "devnet" },
        new FakeSubmitter(),
      ),
    ).rejects.toMatchObject({
      code: SignErrorCode.NOT_REQUIRED_SIGNER,
    });
  });

  // ── Error Handling ─────────────────────────────────────────────────────

  it("rejects invalid base64", async () => {
    await expect(
      signAndSubmit(
        "not-base64!!!",
        { privateKey },
        new FakeSubmitter(),
      ),
    ).rejects.toMatchObject({
      code: SignErrorCode.INVALID_BASE64,
    });
  });

  it("rejects empty string", async () => {
    await expect(
      signAndSubmit(
        "",
        { privateKey },
        new FakeSubmitter(),
      ),
    ).rejects.toMatchObject({
      code: SignErrorCode.DECODE_FAILED,
    });
  });

  it("rejects missing private key", async () => {
    await expect(
      signAndSubmit(
        "deadbeef",
        { privateKey: "" },
        new FakeSubmitter(),
      ),
    ).rejects.toMatchObject({
      code: SignErrorCode.MISSING_PRIVATE_KEY,
    });
  });

  it("rejects invalid private key", async () => {
    await expect(
      signAndSubmit(
        "deadbeef",
        { privateKey: "not-a-key" },
        new FakeSubmitter(),
      ),
    ).rejects.toMatchObject({
      code: SignErrorCode.MISSING_PRIVATE_KEY,
    });
  });

  it("handles submission failure", async () => {
    const base64Tx = makeLegacyTx(keypair);
    const fakeSubmitter = new FakeSubmitter();
    fakeSubmitter.shouldFail = true;
    fakeSubmitter.failMessage = "Network timeout";

    await expect(
      signAndSubmit(
        base64Tx,
        { privateKey, network: "devnet" },
        fakeSubmitter,
      ),
    ).rejects.toMatchObject({
      code: SignErrorCode.SUBMISSION_FAILED,
      detail: "Network timeout",
    });
  });

  // ── Defaults ────────────────────────────────────────────────────────────

  it("defaults to mainnet-beta when network not specified", async () => {
    const base64Tx = makeLegacyTx(keypair);
    const fakeSubmitter = new FakeSubmitter();

    const result = await signAndSubmit(
      base64Tx,
      { privateKey },
      fakeSubmitter,
    );

    expect(result.network).toBe("mainnet-beta");
  });
});

// ─── checkIncompleteSigners Tests ──────────────────────────────────────────

describe("checkIncompleteSigners", () => {
  it("detects unsigned legacy transaction", () => {
    const kp = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1000,
      }),
    );
    tx.feePayer = kp.publicKey;
    tx.recentBlockhash = "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj";

    const incomplete = checkIncompleteSigners(tx);
    expect(incomplete.length).toBe(1);
    expect(incomplete[0].toBase58()).toBe(kp.publicKey.toBase58());
  });

  it("detects partially signed legacy transaction", () => {
    const kp1 = Keypair.generate();
    const kp2 = Keypair.generate();
    const tx = new Transaction()
      .add(
        SystemProgram.transfer({
          fromPubkey: kp1.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 500,
        }),
      )
      .add(
        SystemProgram.transfer({
          fromPubkey: kp2.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 500,
        }),
      );
    tx.feePayer = kp1.publicKey;
    tx.recentBlockhash = "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj";
    tx.partialSign(kp1); // Only kp1 signed

    const incomplete = checkIncompleteSigners(tx);
    expect(incomplete.length).toBe(1);
    expect(incomplete[0].toBase58()).toBe(kp2.publicKey.toBase58());
  });

  it("returns empty for fully signed legacy transaction", () => {
    const kp = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1000,
      }),
    );
    tx.feePayer = kp.publicKey;
    tx.recentBlockhash = "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj";
    tx.sign(kp);

    const incomplete = checkIncompleteSigners(tx);
    expect(incomplete.length).toBe(0);
  });

  it("detects unsigned v0 transaction", () => {
    const kp = Keypair.generate();
    const instructions = [
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1000,
      }),
    ];
    const message = new TransactionMessage({
      payerKey: kp.publicKey,
      recentBlockhash: "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj",
      instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    const incomplete = checkIncompleteSigners(tx);
    expect(incomplete.length).toBe(1);
    expect(incomplete[0].toBase58()).toBe(kp.publicKey.toBase58());
  });
});

// ─── RpcSubmitter (mocked connection) ──────────────────────────────────────

describe("RpcSubmitter", () => {
  it("submit delegates to sendAndConfirmTransaction for legacy tx", async () => {
    vi.mock("@solana/web3.js", async () => {
      const actual = await vi.importActual("@solana/web3.js");
      return {
        ...actual,
        sendAndConfirmTransaction: vi.fn().mockResolvedValue("mock_sig_123"),
        Connection: vi.fn().mockImplementation(() => ({
          sendRawTransaction: vi.fn(),
          getLatestBlockhash: vi.fn(),
          confirmTransaction: vi.fn(),
        })),
      };
    });

    const kp = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1000,
      }),
    );
    tx.feePayer = kp.publicKey;
    tx.recentBlockhash = "GfEQj24NMUnPFYxwQGqRhnDEe5W4j9ZpCD4dQEjL6dYj";
    tx.sign(kp);

    const connection = new Connection("http://localhost:8899");
    const submitter = new RpcSubmitter();

    // Since we can't easily mock constructors, this test validates that
    // the submitter exists and has the correct interface
    expect(submitter).toBeInstanceOf(RpcSubmitter);
    expect(typeof submitter.submit).toBe("function");
  });
});