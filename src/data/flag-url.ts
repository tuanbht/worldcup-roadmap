/**
 * Build a FIFA flag image URL from a 3-letter country code. FIFA serves square
 * flags from a templated path; size 1..4 selects the asset resolution.
 */
export function fifaFlagUrl(code: string, size: 1 | 2 | 3 | 4 = 4): string {
  return `https://api.fifa.com/api/v3/picture/flags-sq-${size}/${code}`;
}
