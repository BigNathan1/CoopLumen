import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider, useLocale, useTranslation } from '../useLocale';
import { LOCALE_STORAGE_KEY } from '@/lib/i18n';

function wrapper({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

describe('useLocale', () => {
  it('throws a useful error outside a LocaleProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useLocale())).toThrow(
      'useLocale must be used within a LocaleProvider'
    );
  });

  it('defaults to English and left-to-right', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.locale).toBe('en');
    expect(result.current.direction).toBe('ltr');
    expect(result.current.t('nav.dashboard')).toBe('Dashboard');
  });

  it('adopts a stored locale on mount', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'sw');

    const { result } = renderHook(() => useLocale(), { wrapper });

    expect(result.current.locale).toBe('sw');
    expect(result.current.t('nav.dashboard')).toBe('Dashibodi');
  });

  it('switches locale, persists the choice and updates translations', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });

    act(() => result.current.setLocale('sw'));

    expect(result.current.locale).toBe('sw');
    expect(result.current.t('common.retry')).toBe('Jaribu tena');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('sw');
  });

  it('mirrors the locale onto the html element as lang and dir', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });

    act(() => result.current.setLocale('sw'));

    expect(document.documentElement.lang).toBe('sw');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('honours an explicit defaultLocale', () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: ({ children }) => <LocaleProvider defaultLocale="sw">{children}</LocaleProvider>,
    });

    expect(result.current.locale).toBe('sw');
  });

  it('still applies the choice when storage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useLocale(), { wrapper });
    act(() => result.current.setLocale('sw'));

    expect(result.current.locale).toBe('sw');
    expect(document.documentElement.lang).toBe('sw');
  });
});

describe('useTranslation', () => {
  it('exposes the translator plus locale metadata', () => {
    function Consumer() {
      const { t, locale, direction } = useTranslation();
      return (
        <span>
          {locale}:{direction}:{t('nav.profile')}
        </span>
      );
    }

    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>
    );

    expect(screen.getByText('en:ltr:Profile')).toBeInTheDocument();
  });

  it('re-renders consumers when the locale changes', async () => {
    const user = userEvent.setup();

    function Consumer() {
      const { locale, setLocale, t } = useLocale();
      return (
        <button type="button" onClick={() => setLocale(locale === 'en' ? 'sw' : 'en')}>
          {t('common.retry')}
        </button>
      );
    }

    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>
    );

    expect(screen.getByRole('button')).toHaveTextContent('Retry');

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveTextContent('Jaribu tena');
  });
});
