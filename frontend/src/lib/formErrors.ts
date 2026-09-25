import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Maps a field-to-message validation result onto react-hook-form while keeping
 * unknown backend paths at the form level. The shared `Form` wrapper owns the
 * focus and ARIA wiring; this helper only has to place the messages.
 */
export function setSchemaFieldErrors<TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  errors: Record<string, string>
): string | undefined {
  let firstField: string | undefined;

  for (const [path, message] of Object.entries(errors)) {
    if (!path || path === 'requestBody') {
      setError('root' as Path<TValues>, { type: 'validation', message });
      continue;
    }

    setError(path as Path<TValues>, { type: 'validation', message });
    firstField ??= path;
  }

  return firstField;
}
