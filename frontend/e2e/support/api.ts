import type { APIRequestContext } from '@playwright/test';

/** The community record the API returns. */
export interface CommunityRecord {
  id: string;
  name: string;
  description: string | null;
  issuer_public_key: string;
  asset_code: string;
  asset_issuer: string;
}

/** The payload the create-community endpoint expects. */
export interface CommunityInput {
  name: string;
  description?: string;
  issuerPublicKey: string;
  assetCode: string;
  assetIssuer: string;
}

/** Every API route answers with the same envelope. */
interface Envelope<T> {
  data: T;
  error?: unknown;
}

/**
 * Creates a community through the API.
 *
 * Used to arrange a test without going through the browser, so a spec can
 * start from a community that already exists.
 */
export async function createCommunity(
  request: APIRequestContext,
  apiUrl: string,
  sessionToken: string,
  input: CommunityInput
): Promise<CommunityRecord> {
  const response = await request.post(`${apiUrl}/api/v1/communities`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    data: input,
  });

  if (!response.ok()) {
    throw new Error(
      `Could not create the community "${input.name}": ${response.status()} ${await response.text()}`
    );
  }

  const envelope = (await response.json()) as Envelope<CommunityRecord>;
  return envelope.data;
}

/** Reads a community back through the API. */
export async function getCommunity(
  request: APIRequestContext,
  apiUrl: string,
  id: string
): Promise<CommunityRecord> {
  const response = await request.get(`${apiUrl}/api/v1/communities/${id}`);

  if (!response.ok()) {
    throw new Error(
      `Could not read community ${id}: ${response.status()} ${await response.text()}`
    );
  }

  const envelope = (await response.json()) as Envelope<CommunityRecord>;
  return envelope.data;
}
