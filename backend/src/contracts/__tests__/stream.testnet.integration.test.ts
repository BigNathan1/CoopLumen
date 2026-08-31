/**
 * Integration test for streamPayments against Stellar testnet.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { submitPayment } from '../transactions';

const RUN = process.env.STELLAR_TESTNET_INTEGRATION === '1';
const describeIf = RUN ? describe : describe.skip;

const FRIENDBOT_URL = process.env.STELLAR_FRIENDBOT_URL ?? 'https://friendbot.stellar.org';

jest.setTimeout(60_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

describeIf('streamPayments testnet integration', () => {
  let sender: Keypair;
  let receiver: Keypair;

  beforeAll(async () => {
    sender = Keypair.random();
    receiver = Keypair.random();

    await Promise.all([fundAccount(sender.publicKey()), fundAccount(receiver.publicKey())]);
  });

  it('receives real-time payment notifications', async () => {
    const messages: any[] = [];
    const errors: Error[] = [];

    const cancelStream = StellarService.streamPayments(
      receiver.publicKey(),
      (msg) => messages.push(msg),
      (err) => errors.push(err)
    );

    // Give the stream a moment to connect
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Submit a payment
    const txHash = await submitPayment({
      senderSecret: sender.secret(),
      destinationPublicKey: receiver.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '2.5000000',
    });

    expect(txHash).toMatch(/^[a-f0-9]{64}$/);

    // Wait up to 10 seconds for the message to arrive
    let waitTime = 0;
    while (messages.length === 0 && waitTime < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      waitTime += 1000;
    }

    cancelStream();

    expect(errors).toHaveLength(0);
    expect(messages.length).toBeGreaterThan(0);

    const paymentMsg = messages.find((m) => m.transaction_hash === txHash);
    expect(paymentMsg).toBeDefined();
    expect(paymentMsg.type).toBe('payment');
    expect(paymentMsg.amount).toBe('2.5000000');
    expect(paymentMsg.from).toBe(sender.publicKey());
    expect(paymentMsg.to).toBe(receiver.publicKey());
  });
});
