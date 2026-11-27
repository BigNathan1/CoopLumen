#!/usr/bin/env node
/**
 * A stand-in Horizon server for the E2E stack.
 *
 * The backend reads balances from Horizon and submits transactions to it. On
 * the real testnet the suite's addresses are unfunded and the escrow account
 * holds nothing, so flows that move funds could not run. This server answers
 * the handful of Horizon endpoints those flows use, with accounts the suite
 * registers itself, and records every submitted transaction so a spec can
 * assert what the backend sent.
 *
 * It has no dependencies, so the Compose stack runs it on a stock Node image.
 *
 * Horizon endpoints:
 *   GET  /                          root document (the backend's health check)
 *   GET  /accounts/:id              a registered account, or Horizon's 404
 *   GET  /accounts/:id/transactions an empty page
 *   GET  /fee_stats                 fixed base fee
 *   POST /transactions              accepts the envelope and returns a hash
 *
 * Control endpoints for the suite:
 *   PUT  /_e2e/accounts/:id         register an account: { balances: [...] }
 *   GET  /_e2e/transactions         envelopes submitted so far
 *
 * A submitted transaction must come from a registered account and carry its
 * next sequence number (otherwise tx_bad_seq), as on the real network.
 *
 * Accounts listed in FAKE_HORIZON_ACCOUNTS (comma-separated) are registered
 * at start-up with a native balance, which is how the escrow account exists.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { encodeStrKey, VERSION_ACCOUNT } from './strkey.mjs';

const PORT = Number(process.env.PORT ?? 8000);
const PASSPHRASE = 'Test SDF Network ; September 2015';

/** @type {Map<string, { sequence: bigint, balances: object[] }>} */
const accounts = new Map();
/** @type {{ envelope: string, hash: string }[]} */
const submitted = [];
let ledger = 1000;

function nativeBalance(balance = '10000.0000000') {
  return { asset_type: 'native', balance };
}

function register(id, balances = []) {
  const existing = accounts.get(id);
  accounts.set(id, {
    sequence: existing?.sequence ?? 100n,
    balances: [
      nativeBalance(),
      ...balances.map((line) => ({
        asset_type: line.asset_code.length > 4 ? 'credit_alphanum12' : 'credit_alphanum4',
        asset_code: line.asset_code,
        asset_issuer: line.asset_issuer,
        balance: line.balance,
        limit: '922337203685.4775807',
        is_authorized: true,
      })),
    ],
  });
}

for (const id of (process.env.FAKE_HORIZON_ACCOUNTS ?? '').split(',').filter(Boolean)) {
  register(id.trim());
}

function accountRecord(id, account) {
  return {
    id,
    account_id: id,
    sequence: account.sequence.toString(),
    subentry_count: 0,
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
    balances: account.balances,
    signers: [{ key: id, weight: 1, type: 'ed25519_public_key' }],
    data: {},
    _links: {},
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/hal+json' });
  res.end(JSON.stringify(body));
}

function notFound(res) {
  send(res, 404, {
    type: 'https://stellar.org/horizon-errors/not_found',
    title: 'Resource Missing',
    status: 404,
    detail: 'The resource at the url requested was not found.',
  });
}

const ENVELOPE_TYPE_TX = 2;
const KEY_TYPE_ED25519 = 0;
const KEY_TYPE_MUXED_ED25519 = 0x100;

/**
 * Reads the source account and sequence number from a v1 transaction
 * envelope: envelope type, muxed source account, fee, then the sequence.
 */
function sourceAndSequence(envelopeBase64) {
  const xdr = Buffer.from(envelopeBase64, 'base64');
  if (xdr.readInt32BE(0) !== ENVELOPE_TYPE_TX) return null;
  const keyType = xdr.readInt32BE(4);
  let offset = 8;
  if (keyType === KEY_TYPE_MUXED_ED25519) offset += 8;
  else if (keyType !== KEY_TYPE_ED25519) return null;
  const source = encodeStrKey(VERSION_ACCOUNT, xdr.subarray(offset, offset + 32));
  const sequence = xdr.readBigInt64BE(offset + 32 + 4);
  return { source, sequence };
}

function badSequence(res) {
  send(res, 400, {
    type: 'https://stellar.org/horizon-errors/transaction_failed',
    title: 'Transaction Failed',
    status: 400,
    extras: { result_codes: { transaction: 'tx_bad_seq' } },
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://horizon');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && parts.length === 0) {
      return send(res, 200, { horizon_version: 'e2e', network_passphrase: PASSPHRASE });
    }

    if (req.method === 'GET' && parts[0] === 'accounts' && parts.length === 2) {
      const account = accounts.get(parts[1]);
      return account ? send(res, 200, accountRecord(parts[1], account)) : notFound(res);
    }

    if (req.method === 'GET' && parts[0] === 'accounts' && parts[2] === 'transactions') {
      return send(res, 200, { _links: {}, _embedded: { records: [] } });
    }

    if (req.method === 'GET' && parts[0] === 'fee_stats') {
      return send(res, 200, { last_ledger: String(ledger), last_ledger_base_fee: '100' });
    }

    if (req.method === 'POST' && parts[0] === 'transactions' && parts.length === 1) {
      const envelope = new URLSearchParams(await readBody(req)).get('tx') ?? '';

      // Like Horizon, accept only the next sequence number and then advance
      // it, so two transactions from one account never share a sequence.
      const parsed = sourceAndSequence(envelope);
      const account = parsed && accounts.get(parsed.source);
      if (!account) return notFound(res);
      if (parsed.sequence !== account.sequence + 1n) return badSequence(res);
      account.sequence = parsed.sequence;

      const hash = createHash('sha256').update(envelope).digest('hex');
      ledger += 1;
      submitted.push({ envelope, hash });
      return send(res, 200, {
        id: hash,
        hash,
        ledger,
        successful: true,
        envelope_xdr: envelope,
      });
    }

    if (req.method === 'PUT' && parts[0] === '_e2e' && parts[1] === 'accounts' && parts[2]) {
      const { balances = [] } = JSON.parse((await readBody(req)) || '{}');
      register(parts[2], balances);
      return send(res, 200, accountRecord(parts[2], accounts.get(parts[2])));
    }

    if (req.method === 'GET' && parts[0] === '_e2e' && parts[1] === 'transactions') {
      return send(res, 200, { records: submitted });
    }

    return notFound(res);
  } catch (error) {
    return send(res, 500, { title: 'Fake Horizon error', detail: String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`fake Horizon listening on ${PORT}`);
});
