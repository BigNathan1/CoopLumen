#!/usr/bin/env node
/**
 * Prints a fresh, throwaway Stellar keypair for the E2E stack's loan escrow.
 *
 * The backend signs escrow transactions with ESCROW_SOURCE_SECRET. In the E2E
 * stack those transactions go to the fake Horizon, so the key never holds
 * funds; it is generated per run so no secret seed is committed.
 *
 * Output is KEY=value lines, ready for `>> "$GITHUB_ENV"` or `export $(...)`:
 *   E2E_ESCROW_SECRET=S...
 *   E2E_ESCROW_ADDRESS=G...
 */
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { encodeStrKey, VERSION_ACCOUNT, VERSION_SEED } from './strkey.mjs';

const { privateKey } = generateKeyPairSync('ed25519');
const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);

console.log(`E2E_ESCROW_SECRET=${encodeStrKey(VERSION_SEED, seed)}`);
console.log(`E2E_ESCROW_ADDRESS=${encodeStrKey(VERSION_ACCOUNT, publicKey)}`);
