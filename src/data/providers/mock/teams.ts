/**
 * 48 nations for the mock tournament, ordered strongest-first (index drives the
 * simulated strength so favourites tend to advance). Group is assigned by
 * `index % 12`, giving a pot-style spread across groups A–L. Codes are FIFA
 * 3-letter codes so the flag URLs resolve against api.fifa.com.
 *
 * This is illustrative demo data, not an official draw.
 */
export interface SeedNation {
  readonly name: string;
  readonly code: string;
}

export const MOCK_NATIONS: readonly SeedNation[] = [
  { name: 'Argentina', code: 'ARG' },
  { name: 'France', code: 'FRA' },
  { name: 'Brazil', code: 'BRA' },
  { name: 'England', code: 'ENG' },
  { name: 'Spain', code: 'ESP' },
  { name: 'Portugal', code: 'POR' },
  { name: 'Netherlands', code: 'NED' },
  { name: 'Germany', code: 'GER' },
  { name: 'Belgium', code: 'BEL' },
  { name: 'Croatia', code: 'CRO' },
  { name: 'Italy', code: 'ITA' },
  { name: 'Uruguay', code: 'URU' },
  { name: 'Colombia', code: 'COL' },
  { name: 'Mexico', code: 'MEX' },
  { name: 'United States', code: 'USA' },
  { name: 'Canada', code: 'CAN' },
  { name: 'Japan', code: 'JPN' },
  { name: 'Korea Republic', code: 'KOR' },
  { name: 'Australia', code: 'AUS' },
  { name: 'Senegal', code: 'SEN' },
  { name: 'Morocco', code: 'MAR' },
  { name: 'Switzerland', code: 'SUI' },
  { name: 'Denmark', code: 'DEN' },
  { name: 'Serbia', code: 'SRB' },
  { name: 'Poland', code: 'POL' },
  { name: 'Ukraine', code: 'UKR' },
  { name: 'Ecuador', code: 'ECU' },
  { name: 'Nigeria', code: 'NGA' },
  { name: 'Cameroon', code: 'CMR' },
  { name: 'Ghana', code: 'GHA' },
  { name: 'Côte d’Ivoire', code: 'CIV' },
  { name: 'Egypt', code: 'EGY' },
  { name: 'Tunisia', code: 'TUN' },
  { name: 'Algeria', code: 'ALG' },
  { name: 'Saudi Arabia', code: 'KSA' },
  { name: 'Iran', code: 'IRN' },
  { name: 'Qatar', code: 'QAT' },
  { name: 'Costa Rica', code: 'CRC' },
  { name: 'Panama', code: 'PAN' },
  { name: 'Paraguay', code: 'PAR' },
  { name: 'Peru', code: 'PER' },
  { name: 'Chile', code: 'CHI' },
  { name: 'Scotland', code: 'SCO' },
  { name: 'Wales', code: 'WAL' },
  { name: 'Sweden', code: 'SWE' },
  { name: 'Norway', code: 'NOR' },
  { name: 'Türkiye', code: 'TUR' },
  { name: 'Austria', code: 'AUT' },
];
