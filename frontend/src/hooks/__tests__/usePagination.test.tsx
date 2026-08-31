import { act, renderHook } from '@testing-library/react';
import { usePagination } from '../usePagination';

/** Mutable mock state shared between the test and the mocked hooks. */
const mockState = {
  searchParams: new URLSearchParams(),
  pathname: '/communities',
  pushed: '' as string,
};

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockState.searchParams,
  usePathname: () => mockState.pathname,
  useRouter: () => ({
    push: jest.fn((url: string) => {
      mockState.pushed = url;
    }),
  }),
}));

beforeEach(() => {
  mockState.searchParams = new URLSearchParams();
  mockState.pathname = '/communities';
  mockState.pushed = '';
});

describe('usePagination', () => {
  it('defaults to page 1 when no query param is present', () => {
    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.page).toBe(1);
    expect(result.current.isFirstPage).toBe(true);
    expect(result.current.isLastPage).toBe(false);
  });

  it('reads the page number from the URL search param', () => {
    mockState.searchParams = new URLSearchParams('page=3');

    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.page).toBe(3);
  });

  it('clamps a page number above totalPages to the last page', () => {
    mockState.searchParams = new URLSearchParams('page=99');

    const { result } = renderHook(() => usePagination({ totalPages: 5 }));

    expect(result.current.page).toBe(5);
    expect(result.current.isLastPage).toBe(true);
  });

  it('clamps a negative page number to 1', () => {
    mockState.searchParams = new URLSearchParams('page=-3');

    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.page).toBe(1);
  });

  it('clamps a zero page number to 1', () => {
    mockState.searchParams = new URLSearchParams('page=0');

    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.page).toBe(1);
  });

  it('treats a non-numeric page value as page 1', () => {
    mockState.searchParams = new URLSearchParams('page=abc');

    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.page).toBe(1);
  });

  it('treats a fractional page value as its floor', () => {
    mockState.searchParams = new URLSearchParams('page=3.7');

    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.page).toBe(3);
  });

  it('uses a custom param name', () => {
    mockState.searchParams = new URLSearchParams('p=5');

    const { result } = renderHook(() => usePagination({ totalPages: 10, paramName: 'p' }));

    expect(result.current.page).toBe(5);
  });

  it('exposes the clamped totalPages', () => {
    const { result } = renderHook(() => usePagination({ totalPages: 10 }));

    expect(result.current.totalPages).toBe(10);
  });

  it('clamps totalPages to at least 1 when 0 is passed', () => {
    const { result } = renderHook(() => usePagination({ totalPages: 0 }));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.page).toBe(1);
  });

  describe('setPage', () => {
    it('pushes a URL with the new page number', () => {
      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.setPage(4));

      expect(mockState.pushed).toBe('/communities?page=4');
    });

    it('removes the page param when navigating to page 1', () => {
      mockState.searchParams = new URLSearchParams('page=3');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.setPage(1));

      expect(mockState.pushed).toBe('/communities');
    });

    it('preserves other search params', () => {
      mockState.searchParams = new URLSearchParams('search=eco&page=2');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.setPage(5));

      const url = new URL(mockState.pushed, 'http://localhost');
      expect(url.searchParams.get('search')).toBe('eco');
      expect(url.searchParams.get('page')).toBe('5');
    });

    it('clamps the target page to valid range', () => {
      const { result } = renderHook(() => usePagination({ totalPages: 5 }));

      act(() => result.current.setPage(100));

      expect(mockState.pushed).toBe('/communities?page=5');

      mockState.pushed = '';

      act(() => result.current.setPage(-5));

      expect(mockState.pushed).toBe('/communities');
    });

    it('floors a fractional target page', () => {
      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.setPage(3.9));

      expect(mockState.pushed).toBe('/communities?page=3');
    });
  });

  describe('nextPage', () => {
    it('advances to the next page', () => {
      mockState.searchParams = new URLSearchParams('page=3');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.nextPage());

      expect(mockState.pushed).toBe('/communities?page=4');
    });

    it('is a no-op on the last page', () => {
      mockState.searchParams = new URLSearchParams('page=10');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.nextPage());

      expect(mockState.pushed).toBe('');
    });
  });

  describe('prevPage', () => {
    it('goes back to the previous page', () => {
      mockState.searchParams = new URLSearchParams('page=5');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.prevPage());

      expect(mockState.pushed).toBe('/communities?page=4');
    });

    it('is a no-op on the first page', () => {
      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      act(() => result.current.prevPage());

      expect(mockState.pushed).toBe('');
    });
  });

  describe('isFirstPage / isLastPage', () => {
    it('reports isFirstPage true on page 1', () => {
      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      expect(result.current.isFirstPage).toBe(true);
      expect(result.current.isLastPage).toBe(false);
    });

    it('reports isLastPage true on the last page', () => {
      mockState.searchParams = new URLSearchParams('page=10');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      expect(result.current.isFirstPage).toBe(false);
      expect(result.current.isLastPage).toBe(true);
    });

    it('reports both false on a middle page', () => {
      mockState.searchParams = new URLSearchParams('page=5');

      const { result } = renderHook(() => usePagination({ totalPages: 10 }));

      expect(result.current.isFirstPage).toBe(false);
      expect(result.current.isLastPage).toBe(false);
    });
  });
});
