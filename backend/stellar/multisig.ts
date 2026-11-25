export async function removeAccountSigner(
  accountKeypair: Keypair,
  signerPublicKey: string,
  options: { server: Horizon.Server; networkPassphrase?: string },
): Promise<{ hash: string; ledger: number }> {
  if (!StrKey.isValidEd25519PublicKey(signerPublicKey)) {
    throw new StellarMultisigError('INVALID_SIGNER_KEY', `Invalid Ed25519 public key: ${signerPublicKey}`);
  }
  if (signerPublicKey === accountKeypair.publicKey()) {
    throw new StellarMultisigError(
      'CANNOT_REMOVE_MASTER',
      'Cannot remove the master account key via removeAccountSigner; adjust masterWeight instead.',
    );
  }

  const networkPassphrase = options.networkPassphrase ?? Networks.TESTNET;

  try {
    const account = await options.server.loadAccount(accountKeypair.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
      .addOperation(
        Operation.setOptions({
          signer: { ed25519PublicKey: signerPublicKey, weight: 0 },
        }),
      )
      .setTimeout(60)
      .build();

    tx.sign(accountKeypair);
    const submitted = await options.server.submitTransaction(tx);
    return { hash: submitted.hash, ledger: submitted.ledger };
  } catch (err) {
    if (err instanceof StellarMultisigError) throw err;
    throw mapHorizonMultisigError(err);
  }
}