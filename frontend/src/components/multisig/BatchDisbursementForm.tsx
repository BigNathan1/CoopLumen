'use client';

import React, { useState, useId } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Table } from '../ui/Table';
import { Badge } from '../ui/Badge';
import { Alert } from '../ui/Alert';
import { StellarAddress } from '../ui/StellarAddress';
import styles from './BatchDisbursementForm.module.css';

export interface DisbursementItem {
  recipient: string;
  amount: string;
  memo?: string;
  isValid: boolean;
  error?: string;
}

export interface BatchDisbursementFormProps {
  onSubmit?: (
    recipients: Array<{ recipient: string; amount: string; memo?: string }>,
    title: string,
    description?: string
  ) => Promise<void> | void;
  isLoading?: boolean;
  className?: string;
}

const STELLAR_ADDRESS_REGEX = /^G[A-Z0-9]{55}$/;

export function parseCSVContent(content: string): DisbursementItem[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  let startIdx = 0;
  const firstLineLower = lines[0].toLowerCase();
  if (
    firstLineLower.startsWith('recipient,') ||
    firstLineLower.startsWith('address,') ||
    firstLineLower === 'recipient' ||
    firstLineLower === 'address'
  ) {
    startIdx = 1;
  }

  const items: DisbursementItem[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    const recipient = parts[0] ?? '';
    const amount = parts[1] ?? '';
    const memo = parts[2] || undefined;

    let isValid = true;
    let error: string | undefined = undefined;

    if (!recipient || !STELLAR_ADDRESS_REGEX.test(recipient)) {
      isValid = false;
      error = 'Invalid Stellar address';
    } else if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      isValid = false;
      error = 'Amount must be positive number';
    } else if (memo && memo.length > 28) {
      isValid = false;
      error = 'Memo exceeds 28 characters';
    }

    items.push({ recipient, amount, memo, isValid, error });
  }

  return items;
}

export function BatchDisbursementForm({
  onSubmit,
  isLoading = false,
  className,
}: BatchDisbursementFormProps) {
  const titleId = useId();
  const descId = useId();
  const rawCsvId = useId();
  const fileInputId = useId();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rawCSV, setRawCSV] = useState('');
  const [items, setItems] = useState<DisbursementItem[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleTextChange = (text: string) => {
    setRawCSV(text);
    const parsed = parseCSVContent(text);
    setItems(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setRawCSV(text);
        const parsed = parseCSVContent(text);
        setItems(parsed);
      }
    };
    reader.readAsText(file);
  };

  const validItems = items.filter((item) => item.isValid);
  const invalidItems = items.filter((item) => !item.isValid);

  const totalAmount = validItems.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError('Proposal title is required');
      return;
    }

    if (items.length === 0) {
      setSubmitError('Please provide CSV data with recipients');
      return;
    }

    if (invalidItems.length > 0) {
      setSubmitError('Please fix validation errors in CSV rows before submitting');
      return;
    }

    if (!onSubmit) return;

    try {
      await onSubmit(
        validItems.map(({ recipient, amount, memo }) => ({ recipient, amount, memo })),
        title.trim(),
        description.trim() || undefined
      );
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit batch disbursement');
    }
  };

  return (
    <Card className={[styles.container, className].filter(Boolean).join(' ')}>
      <h2 className={styles.title}>Create Batch Disbursement Proposal</h2>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <form onSubmit={handleSubmit} className={styles.formGroup}>
        <Input
          id={titleId}
          label="Proposal Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Q1 Member Grant Disbursement"
        />

        <Textarea
          id={descId}
          label="Description (Optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter details about this batch disbursement..."
          rows={3}
        />

        <div className={styles.field}>
          <label htmlFor={fileInputId} className={styles.label}>
            Upload CSV File
          </label>
          <input
            id={fileInputId}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className={styles.input}
          />
          <span className={styles.helperText}>
            CSV format: recipient_address, amount, memo (optional)
          </span>
        </div>

        <Textarea
          id={rawCsvId}
          label="Or Paste CSV Data Directly"
          value={rawCSV}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`G...ADDRESS1,100,Grant 1\nG...ADDRESS2,250,Grant 2`}
          rows={5}
        />

        {items.length > 0 && (
          <>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total Recipients</span>
                <span className={styles.summaryValue}>{items.length}</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Valid Rows</span>
                <span className={styles.summaryValue}>{validItems.length}</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total Amount</span>
                <span className={styles.summaryValue}>{totalAmount.toLocaleString()} XLM</span>
              </div>
            </div>

            <div className={styles.previewSection}>
              <h3 className={styles.previewTitle}>Recipients Preview Table</h3>
              <Table
                columns={[
                  {
                    key: 'recipient',
                    label: 'Recipient',
                    render: (_, row) =>
                      STELLAR_ADDRESS_REGEX.test(row.recipient) ? (
                        <StellarAddress address={row.recipient} />
                      ) : (
                        <code style={{ color: 'var(--color-text-error, red)' }}>
                          {row.recipient || '(Empty)'}
                        </code>
                      ),
                  },
                  {
                    key: 'amount',
                    label: 'Amount',
                    render: (_, row) => `${row.amount} XLM`,
                  },
                  {
                    key: 'memo',
                    label: 'Memo',
                    render: (_, row) => row.memo || '-',
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (_, row) =>
                      row.isValid ? (
                        <Badge variant="success" size="sm">
                          Valid
                        </Badge>
                      ) : (
                        <Badge variant="error" size="sm">
                          {row.error || 'Invalid'}
                        </Badge>
                      ),
                  },
                ]}
                data={items as Array<DisbursementItem & Record<string, unknown>>}
                ariaLabel="Batch disbursement recipients preview"
              />
            </div>
          </>
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            disabled={isLoading || items.length === 0 || invalidItems.length > 0}
          >
            Submit Disbursement Proposal
          </Button>
        </div>
      </form>
    </Card>
  );
}
