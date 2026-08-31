'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  address: string;
  size?: number;
  label?: string;
  className?: string;
}

export function QRCode({
  address,
  size = 192,
  label = 'Stellar address QR code',
  className,
}: QRCodeProps) {
  return (
    <div
      className={className}
      role="img"
      aria-label={`${label}: ${address}`}
    >
      <QRCodeSVG
        value={address}
        size={size}
        title={label}
        role="presentation"
        bgColor="transparent"
        fgColor="currentColor"
      />
    </div>
  );
}
