import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { LocaleProvider } from '@/hooks/useLocale';
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';

function renderSwitcher(defaultLocale?: Locale) {
  return render(
    <LocaleProvider defaultLocale={defaultLocale}>
      <LocaleSwitcher />
    </LocaleProvider>
  );
}

/** The endonyms the switcher is expected to offer, keyed by locale. */
const LABELS: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

describe('LocaleSwitcher', () => {
  it('offers every supported locale as an option', () => {
    renderSwitcher();

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(
      SUPPORTED_LOCALES.map((locale) => LABELS[locale])
    );
  });

  it('shows the active locale as the selected option', () => {
    renderSwitcher('sw');

    expect(screen.getByRole('combobox')).toHaveValue('sw');
  });

  it('names the control from the catalog so the label is translated', () => {
    renderSwitcher();

    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });

  it('uses the Swahili label when the UI is already Swahili', () => {
    renderSwitcher('sw');

    expect(screen.getByRole('combobox', { name: 'Lugha' })).toBeInTheDocument();
  });

  it('keeps language names in their own language rather than translating them', () => {
    renderSwitcher('sw');

    // A Swahili speaker still looks for "English" under the English entry.
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Kiingereza' })).not.toBeInTheDocument();
  });

  it('switches, persists and mirrors the language onto the html element', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(screen.getByRole('combobox'), 'sw');

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('sw');
    expect(document.documentElement.lang).toBe('sw');
  });

  it('translated the control itself after a switch', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(screen.getByRole('combobox'), 'sw');

    expect(screen.getByRole('combobox', { name: 'Lugha' })).toBeInTheDocument();
  });
});
