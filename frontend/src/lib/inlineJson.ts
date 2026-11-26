/**
 * Serialises a value for embedding inside an inline `<script>`.
 *
 * `JSON.stringify` alone leaves `<` untouched, so a string containing
 * `</script>` would close the tag early. Escaping every `<` keeps the value
 * inert whatever it contains.
 */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
