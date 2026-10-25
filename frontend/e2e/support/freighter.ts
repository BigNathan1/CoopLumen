import { createPrivateKey, sign } from 'node:crypto';
import type { Page } from '@playwright/test';

/**
 * The address of the suite's wallet.
 *
 * A throwaway key derived from `sha256('cooplumen-e2e-wallet')`. It is never
 * funded and only ever signs sign-in challenges for the E2E stack.
 */
export const E2E_WALLET_ADDRESS = 'GCOKLMLBWJ2FOYT4QO45T3RADHFF7CXJ4CBUI2CFOEKW7F5JIE2EQVZ3';

/** Raw Ed25519 seed behind {@link E2E_WALLET_ADDRESS}. */
const E2E_WALLET_SEED_HEX = '9b73d8b6cbabe62b3dcda03517eb8a696dcb7e48e83bf95ebb1cf4f460de09bd';

/** DER prefix that wraps a raw 32-byte Ed25519 seed as a PKCS#8 private key. */
const PKCS8_ED25519_PREFIX_HEX = '302e020100300506032b657004220420';

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Signs a message the way Freighter's `signMessage` does: Ed25519, base64. */
function signWithWallet(message: string): string {
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from(PKCS8_ED25519_PREFIX_HEX, 'hex'),
      Buffer.from(E2E_WALLET_SEED_HEX, 'hex'),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  return sign(null, Buffer.from(message, 'utf8'), key).toString('base64');
}

/**
 * Stands in for the Freighter extension.
 *
 * `@stellar/freighter-api` talks to the extension by posting
 * `FREIGHTER_EXTERNAL_MSG_REQUEST` messages to the page and waiting for a
 * `FREIGHTER_EXTERNAL_MSG_RESPONSE`. This answers those messages the way an
 * unlocked extension would after the user approves, so the app runs its real
 * connect and sign-in code: the backend issues a real challenge, the wallet
 * signs it with a real key, and the backend verifies the signature.
 *
 * The site starts out not allowed, so the app shows its connect button; once
 * connected, the grant survives page loads the way the extension's does.
 */
export async function installFreighter(page: Page): Promise<void> {
  await page.exposeFunction('__e2eFreighterSign', signWithWallet);
  await page.addInitScript(
    ({ address, passphrase }) => {
      const sign = (window as unknown as { __e2eFreighterSign: (m: string) => Promise<string> })
        .__e2eFreighterSign;
      // Freighter remembers a site's grant, so the app reconnects on the next
      // page load. Session storage is fresh for every test's browser context.
      const GRANT_KEY = 'e2e-freighter-allowed';
      const isGranted = () => window.sessionStorage.getItem(GRANT_KEY) === 'true';
      const grant = () => window.sessionStorage.setItem(GRANT_KEY, 'true');

      window.addEventListener('message', (event: MessageEvent) => {
        const request = event.data as {
          source?: string;
          type?: string;
          messageId?: number;
          blob?: string;
        };
        if (event.source !== window || request?.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') {
          return;
        }

        const respond = (payload: Record<string, unknown>) =>
          window.postMessage(
            // The library matches replies on `messagedId` (sic).
            {
              source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE',
              messagedId: request.messageId,
              ...payload,
            },
            window.location.origin
          );

        switch (request.type) {
          case 'REQUEST_CONNECTION_STATUS':
            respond({ isConnected: true });
            break;
          case 'REQUEST_ALLOWED_STATUS':
            respond({ isAllowed: isGranted() });
            break;
          case 'SET_ALLOWED_STATUS':
          case 'REQUEST_ACCESS':
            grant();
            respond({ isAllowed: true, publicKey: address });
            break;
          case 'REQUEST_PUBLIC_KEY':
            grant();
            respond({ publicKey: address });
            break;
          case 'REQUEST_NETWORK_DETAILS':
            respond({
              networkDetails: {
                network: 'TESTNET',
                networkName: 'Test Net',
                networkUrl: 'https://horizon-testnet.stellar.org',
                networkPassphrase: passphrase,
              },
            });
            break;
          case 'SUBMIT_BLOB':
            void sign(request.blob ?? '').then((signedBlob) =>
              respond({ signedBlob, signerAddress: address })
            );
            break;
          default:
            respond({
              apiError: { code: -1, message: `Not supported in the E2E wallet: ${request.type}` },
            });
        }
      });
    },
    { address: E2E_WALLET_ADDRESS, passphrase: TESTNET_PASSPHRASE }
  );
}
