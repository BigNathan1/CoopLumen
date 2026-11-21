'use client';

import { useLoan, type LoanDetail } from '@/hooks/useLoans';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import styles from './LoanDetail.module.css';

const EVENT_LABEL: Record<LoanDetail['events'][0]['event_type'], string> = {
  created: 'Created',
  disbursed: 'Disbursed',
  repayment: 'Repayment',
  closed: 'Closed',
  defaulted: 'Defaulted',
};

const EVENT_COLOR: Record<LoanDetail['events'][0]['event_type'], string> = {
  created: 'var(--color-info)',
  disbursed: 'var(--color-primary)',
  repayment: 'var(--color-success)',
  closed: 'var(--color-secondary)',
  defaulted: 'var(--color-error)',
};

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

function formatAmount(value: string): string {
  return parseFloat(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDateOnly(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
}

export interface LoanDetailProps {
  loanId: string;
}

export function LoanDetail({ loanId }: LoanDetailProps) {
  const { data: loan, error, isLoading, mutate } = useLoan(loanId);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton} aria-busy="true" data-testid="loading-skeleton">
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>Could not load loan details</p>
          <Button variant="ghost" size="sm" onClick={() => void mutate()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const rate = Number(loan.interest_rate ?? 0);
  const outstanding = Number(loan.outstanding);
  const totalDue = Number(loan.total_due);
  const repaymentProgress = totalDue > 0 ? ((totalDue - outstanding) / totalDue) * 100 : 0;

  const repaymentEvents = loan.events.filter(
    (e) => e.event_type === 'repayment' || e.event_type === 'closed'
  );

  return (
    <section className={styles.container} aria-labelledby="loan-title">
      <header className={styles.header}>
        <h2 id="loan-title" className={styles.title}>
          Loan {shortAddress(loan.id)}
        </h2>
        <span className={`${styles.status} ${styles[loan.status]}`}>{loan.status}</span>
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Summary</h3>
            <dl className={styles.dl}>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Amount</dt>
                <dd className={styles.dd}>
                  {formatAmount(loan.amount)} <span className={styles.asset}>{loan.asset_code}</span>
                </dd>
              </div>
              {rate > 0 && (
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Interest rate</dt>
                  <dd className={styles.dd}>{rate}% (flat)</dd>
                </div>
              )}
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Total due</dt>
                <dd className={styles.dd}>
                  {formatAmount(loan.total_due)} <span className={styles.asset}>{loan.asset_code}</span>
                </dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Outstanding</dt>
                <dd className={styles.dd}>
                  {formatAmount(loan.outstanding)} <span className={styles.asset}>{loan.asset_code}</span>
                </dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Repayment progress</dt>
                <dd className={styles.dd}>
                  <ProgressBar
                    value={Math.min(repaymentProgress, 100)}
                    max={100}
                    label={`${Math.round(repaymentProgress)}%`}
                    size="sm"
                    className={styles.progress}
                  />
                </dd>
              </div>
              {loan.due_at && (
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Due date</dt>
                  <dd className={styles.dd}>{formatDateOnly(loan.due_at)}</dd>
                </div>
              )}
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Created</dt>
                <dd className={styles.dd}>{formatTimestamp(loan.created_at)}</dd>
              </div>
              {loan.disbursed_at && (
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Disbursed</dt>
                  <dd className={styles.dd}>{formatTimestamp(loan.disbursed_at)}</dd>
                </div>
              )}
              {loan.closed_at && (
                <div className={styles.dlRow}>
                  <dt className={styles.dt}>Closed</dt>
                  <dd className={styles.dd}>{formatTimestamp(loan.closed_at)}</dd>
                </div>
              )}
            </dl>
          </div>

          {loan.purpose && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Purpose</h3>
              <p className={styles.purpose}>{loan.purpose}</p>
            </div>
          )}

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Parties</h3>
            <dl className={styles.dl}>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Borrower</dt>
                <dd className={styles.address} title={loan.borrower_address}>
                  {shortAddress(loan.borrower_address)}
                </dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Lender</dt>
                <dd className={styles.address} title={loan.lender_address}>
                  {shortAddress(loan.lender_address)}
                </dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Community</dt>
                <dd className={styles.dd}>{loan.community_id}</dd>
              </div>
            </dl>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Repayment Timeline</h3>
            {repaymentEvents.length === 0 ? (
              <p className={styles.empty}>No repayments recorded yet</p>
            ) : (
              <ol className={styles.timeline} aria-label="Repayment events">
                {repaymentEvents.map((event) => (
                  <li key={event.id} className={styles.timelineItem}>
                    <div className={styles.timelineMarker} style={{ backgroundColor: EVENT_COLOR[event.event_type] }} />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineRow}>
                        <span className={styles.timelineType} style={{ color: EVENT_COLOR[event.event_type] }}>
                          {EVENT_LABEL[event.event_type] ?? event.event_type}
                        </span>
                        {event.amount && (
                          <span className={styles.timelineAmount}>
                            {formatAmount(event.amount)} {loan.asset_code}
                          </span>
                        )}
                      </div>
                      {event.note && <p className={styles.timelineNote}>{event.note}</p>}
                      <time className={styles.timelineTime} dateTime={event.created_at}>
                        {formatTimestamp(event.created_at)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>All Events</h3>
            {loan.events.length === 0 ? (
              <p className={styles.empty}>No events recorded</p>
            ) : (
              <ol className={styles.eventList} aria-label="All loan events">
                {loan.events.map((event) => (
                  <li key={event.id} className={styles.eventItem}>
                    <span className={styles.eventType} style={{ color: EVENT_COLOR[event.event_type] }}>
                      {EVENT_LABEL[event.event_type] ?? event.event_type}
                    </span>
                    {event.amount && (
                      <span className={styles.eventAmount}>
                        {formatAmount(event.amount)} {loan.asset_code}
                      </span>
                    )}
                    {event.note && <span className={styles.eventNote}>{event.note}</span>}
                    <time className={styles.eventTime} dateTime={event.created_at}>
                      {formatTimestamp(event.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}