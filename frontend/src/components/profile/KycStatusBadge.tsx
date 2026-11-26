'use client';

import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import type { KycStatus } from '@/hooks/useKycStatus';

/** Visible label for each public KYC outcome. */
const STATUS_LABEL: Record<KycStatus, string> = {
  none: 'KYC not started',
  pending: 'KYC pending',
  approved: 'KYC verified',
  rejected: 'KYC rejected',
};

/** Badge colour per outcome, reusing the design-system variants. */
const STATUS_VARIANT: Record<KycStatus, BadgeVariant> = {
  none: 'neutral',
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

interface Props {
  status: KycStatus;
  className?: string;
}

/**
 * The KYC outcome for an account or a community issuer.
 *
 * A dot and an `srLabel` carry the meaning for screen-reader users, so the
 * status is never conveyed by colour alone.
 *
 * @example
 * ```tsx
 * <KycStatusBadge status="approved" />
 * ```
 */
export function KycStatusBadge({ status, className }: Props) {
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      size="sm"
      dot
      srLabel="KYC status:"
      className={className}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
