/**
 * Testnet verification script for claimable-balance loan escrow.
 *
 * This script exercises the real Stellar testnet (not mocks) to verify that
 * `claimableBalance.createLoanEscrow` and `claimableBalance.claim` work
 * end-to-end against Horizon.
 *
 * Usage:
 *   npx ts-node backend/scripts/verify-loan-escrow-testnet.ts
 *
 * Environment variables (all optional):
 *   STELLAR_TESTNET_LENDER_SECRET   Secret key of the lender account. If not
 *                                   provided, a new funded testnet keypair is
 *                                   generated via Friendbot.
 *   STELLAR_TESTNET_BORROWER_PUBLIC Public key of the borrower account. If not
 *                                   provided, a new funded testnet keypair is
 *                                   generated via Friendbot.
 *   STELLAR_TESTNET_BORROWER_SECRET Secret key of the borrower account, used to
 *                                   sign the claim. Required if
 *                                   STELLAR_TESTNET_BORROWER_PUBLIC is set and
 *                                   the borrower must claim the balance.
 *   STELLAR_HORIZON_URL             Horizon URL (defaults to testnet).
 *   STELLAR_NETWORK_PASSPHRASE      Network passphrase (defaults to testnet).
 *
 * Exit code is non-zero if any step fails.
 */

import {
  Keypair,
  Horizon,
  Networks,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";

import * as claimableBalance from "../src/services/stellar/claimableBalance";

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
const FRIENDBOT_URL = "https://friendbot.stellar.org";

const server = new Horizon.Server(HORIZON_URL);

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: StepResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const status = ok ? "PASS" : "FAIL";
  const suffix = detail ? ` — ${detail}` : "";
  // eslint-disable-next-line no-console
  console.log(`[${status}] ${name}${suffix}`);
}

async function fundAccount(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Friendbot funding failed (${res.status}): ${body}`);
  }
}

async function ensureFunded(keypair: Keypair): Promise<void> {
  try {
    await server.loadAccount(keypair.publicKey());
  } catch {
    await fundAccount(keypair.publicKey());
    // Give Horizon a moment to index the new account.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Verifying loan escrow against ${HORIZON_URL}\n`);

  // --- Resolve keypairs -----------------------------------------------------
  let lender: Keypair;
  if (process.env.STELLAR_TESTNET_LENDER_SECRET) {
    lender = Keypair.fromSecret(process.env.STELLAR_TESTNET_LENDER_SECRET);
  } else {
    lender = Keypair.random();
  }

  let borrower: Keypair;
  if (process.env.STELLAR_TESTNET_BORROWER_PUBLIC) {
    if (!process.env.STELLAR_TESTNET_BORROWER_SECRET) {
      throw new Error(
        "STELLAR_TESTNET_BORROWER_PUBLIC is set but STELLAR_TESTNET_BORROWER_SECRET is missing; " +
          "the borrower must be able to sign the claim.",
      );
    }
    borrower = Keypair.fromSecret(process.env.STELLAR_TESTNET_BORROWER_SECRET);
    if (borrower.publicKey() !== process.env.STELLAR_TESTNET_BORROWER_PUBLIC) {
      throw new Error(
        "STELLAR_TESTNET_BORROWER_SECRET does not match STELLAR_TESTNET_BORROWER_PUBLIC.",
      );
    }
  } else {
    borrower = Keypair.random();
  }

  // eslint-disable-next-line no-console
  console.log(`Lender:   ${lender.publicKey()}`);
  // eslint-disable-next-line no-console
  console.log(`Borrower: ${borrower.publicKey()}\n`);

  // --- Fund accounts --------------------------------------------------------
  try {
    await ensureFunded(lender);
    await ensureFunded(borrower);
    record("fund accounts", true);
  } catch (err) {
    record("fund accounts", false, (err as Error).message);
    finish();
    return;
  }

  // --- Create loan escrow ---------------------------------------------------
  const amount = "1.0000000";
  const dueDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const loanId = `verify-${Date.now()}`;

  let balanceId: string | undefined;
  let txHash: string | undefined;
  let ledger: number | undefined;

  try {
    const result = await claimableBalance.createLoanEscrow({
      lenderSecret: lender.secret(),
      borrowerPublicKey: borrower.publicKey(),
      amount,
      asset: Asset.native(),
      dueDate,
      loanId,
      networkPassphrase: NETWORK_PASSPHRASE,
      horizonUrl: HORIZON_URL,
    });

    balanceId = result.balanceId;
    txHash = result.txHash;
    ledger = result.ledger;

    const ok =
      typeof balanceId === "string" &&
      balanceId.length > 0 &&
      typeof txHash === "string" &&
      txHash.length > 0 &&
      typeof ledger === "number" &&
      ledger > 0;

    record(
      "create loan escrow",
      ok,
      ok
        ? `balanceId=${balanceId} txHash=${txHash} ledger=${ledger}`
        : `unexpected result: ${JSON.stringify(result)}`,
    );

    if (!ok) {
      finish();
      return;
    }
  } catch (err) {
    record("create loan escrow", false, (err as Error).message);
    finish();
    return;
  }

  // --- Verify the balance exists on-chain -----------------------------------
  try {
    const balance = await server
      .claimableBalances()
      .claimableBalance(balanceId as string)
      .call();
    const ok = balance?.id === balanceId;
    record("fetch claimable balance", ok, ok ? balanceId : "balance not found");
    if (!ok) {
      finish();
      return;
    }
  } catch (err) {
    record("fetch claimable balance", false, (err as Error).message);
    finish();
    return;
  }

  // --- Borrower claims the escrow -------------------------------------------
  try {
    const claimResult = await claimableBalance.claim({
      claimantSecret: borrower.secret(),
      balanceId: balanceId as string,
      networkPassphrase: NETWORK_PASSPHRASE,
      horizonUrl: HORIZON_URL,
    });

    const ok =
      typeof claimResult?.txHash === "string" && claimResult.txHash.length > 0;
    record(
      "borrower claims escrow",
      ok,
      ok ? `txHash=${claimResult.txHash}` : `unexpected result: ${JSON.stringify(claimResult)}`,
    );
  } catch (err) {
    record("borrower claims escrow", false, (err as Error).message);
  }

  finish();
}

function finish(): void {
  const failed = results.filter((r) => !r.ok);
  // eslint-disable-next-line no-console
  console.log(
    `\n${results.length - failed.length}/${results.length} steps passed.`,
  );
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n${failed.length} step(s) failed.`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("\nAll steps passed.");
  process.exit(0);
}

// Keep the imports referenced so linters don't flag unused symbols; these are
// used indirectly by the SDK helpers above in some configurations.
void Operation;
void TransactionBuilder;
void BASE_FEE;

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected error:", err);
  process.exit(1);
});