'use client';

import { useState } from 'react';

interface CopyToClipboardProps {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export function CopyToClipboard({
  value,
  label = 'Copy to clipboard',
  copiedLabel = 'Copied',
  className,
}: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? copiedLabel : label}
      aria-live="polite"
      className={className}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
