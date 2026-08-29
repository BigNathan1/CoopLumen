import { HorizonApi } from '@stellar/stellar-sdk/lib/horizon/horizon_api';
import { ServerApi } from '@stellar/stellar-sdk/lib/horizon/server_api';

export interface FormattedAccountDetails {
  id: string;
  account_id: string;
  sequence: string;
  sequence_ledger?: number;
  sequence_time?: string;
  subentry_count: number;
  inflation_destination?: string;
  home_domain?: string;
  last_modified_ledger: number;
  last_modified_time?: string;
  thresholds: HorizonApi.AccountThresholds;
  flags: HorizonApi.Flags;
  balances: HorizonApi.BalanceLine[];
  signers: ServerApi.AccountRecordSigners[];
  data: Record<string, string>;
  num_sponsoring?: number;
  num_sponsored?: number;
  sponsor?: string;
  paging_token?: string;
}

/** Formats an AccountResponse from Horizon into clean account details. */
export function formatAccountDetails(account: unknown): FormattedAccountDetails {
  const acc = account as {
    id?: string;
    account_id?: string;
    sequence?: string;
    sequenceNumber?: () => string;
    sequence_ledger?: number;
    sequence_time?: string;
    subentry_count?: number;
    inflation_destination?: string;
    home_domain?: string;
    last_modified_ledger?: number;
    last_modified_time?: string;
    thresholds?: HorizonApi.AccountThresholds;
    flags?: HorizonApi.Flags;
    balances?: HorizonApi.BalanceLine[];
    signers?: ServerApi.AccountRecordSigners[];
    data_attr?: Record<string, string>;
    data?: unknown;
    num_sponsoring?: number;
    num_sponsored?: number;
    sponsor?: string;
    paging_token?: string;
  };

  const id = acc.id ?? acc.account_id ?? '';
  const dataMap =
    acc.data_attr ??
    (typeof acc.data === 'object' && acc.data !== null && !Array.isArray(acc.data)
      ? (acc.data as Record<string, string>)
      : {});

  return {
    id,
    account_id: acc.account_id ?? id,
    sequence: String(acc.sequence ?? acc.sequenceNumber?.() ?? '0'),
    ...(acc.sequence_ledger !== undefined && { sequence_ledger: acc.sequence_ledger }),
    ...(acc.sequence_time !== undefined && { sequence_time: acc.sequence_time }),
    subentry_count: acc.subentry_count ?? 0,
    ...(acc.inflation_destination !== undefined && {
      inflation_destination: acc.inflation_destination,
    }),
    ...(acc.home_domain !== undefined && { home_domain: acc.home_domain }),
    last_modified_ledger: acc.last_modified_ledger ?? 0,
    ...(acc.last_modified_time !== undefined && { last_modified_time: acc.last_modified_time }),
    thresholds: acc.thresholds ?? { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: acc.flags ?? {
      auth_required: false,
      auth_revocable: false,
      auth_immutable: false,
      auth_clawback_enabled: false,
    },
    balances: acc.balances ?? [],
    signers: acc.signers ?? [],
    data: dataMap,
    ...(acc.num_sponsoring !== undefined && { num_sponsoring: acc.num_sponsoring }),
    ...(acc.num_sponsored !== undefined && { num_sponsored: acc.num_sponsored }),
    ...(acc.sponsor !== undefined && { sponsor: acc.sponsor }),
    ...(acc.paging_token !== undefined && { paging_token: acc.paging_token }),
  };
}
