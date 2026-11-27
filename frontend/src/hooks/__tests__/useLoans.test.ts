import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { fetcher } from '@/lib/swr';
import { useLoans } from '../useLoans';

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/lib/swr', () => ({ fetcher: jest.fn() }));

describe('useLoans', () => {
  beforeEach(() => jest.clearAllMocks());

  it('supports useLoans(communityId, filters) signature', () => {
    renderHook(() => useLoans('comm-1', { status: 'active', borrower: 'GABC', limit: 25 }));
    expect(useSWR).toHaveBeenCalledWith(
      '/api/v1/loans?limit=25&communityId=comm-1&borrower=GABC&status=active',
      fetcher
    );
  });

  it('defers request when communityId is null or empty string', () => {
    renderHook(() => useLoans(null, { status: 'active' }));
    renderHook(() => useLoans('', { status: 'active' }));
    expect(useSWR).toHaveBeenNthCalledWith(1, null, fetcher);
    expect(useSWR).toHaveBeenNthCalledWith(2, null, fetcher);
  });

  it('preserves backward compatibility with useLoans(filters)', () => {
    renderHook(() => useLoans({ status: 'pending', lender: 'GXYZ' }));
    expect(useSWR).toHaveBeenCalledWith(
      '/api/v1/loans?limit=10&lender=GXYZ&status=pending',
      fetcher
    );
  });

  it('uses default limit=10 when called with no arguments', () => {
    renderHook(() => useLoans());
    expect(useSWR).toHaveBeenCalledWith('/api/v1/loans?limit=10', fetcher);
  });
});
