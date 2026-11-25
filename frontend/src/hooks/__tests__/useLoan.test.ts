import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';
import { useLoan } from '../useLoan';

vi.mock('swr', () => ({ default: vi.fn() }));
vi.mock('@/lib/swr', () => ({ fetcher: vi.fn() }));

describe('useLoan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests /api/v1/loans/:id when id is provided and enabled', () => {
    renderHook(() => useLoan('loan-123'));
    expect(useSWR).toHaveBeenCalledWith('/api/v1/loans/loan-123', fetcher);
  });

  it('passes null key when enabled is false', () => {
    renderHook(() => useLoan('loan-123', false));
    expect(useSWR).toHaveBeenCalledWith(null, fetcher);
  });

  it('passes null key when id is empty, null, or undefined', () => {
    renderHook(() => useLoan(''));
    renderHook(() => useLoan(null));
    renderHook(() => useLoan(undefined));
    expect(useSWR).toHaveBeenNthCalledWith(1, null, fetcher);
    expect(useSWR).toHaveBeenNthCalledWith(2, null, fetcher);
    expect(useSWR).toHaveBeenNthCalledWith(3, null, fetcher);
  });

  it('encodes special characters in id', () => {
    renderHook(() => useLoan('loan/abc?1'));
    expect(useSWR).toHaveBeenCalledWith('/api/v1/loans/loan%2Fabc%3F1', fetcher);
  });
});