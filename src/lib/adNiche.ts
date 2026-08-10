// Parser da nomenclatura de anúncios: extrai país e nicho do ad_title.
// Exemplos:
//  "(EMA-BR) PODV8-G1 (API 7)-BR › HOMEM › AD"        -> BR / EMA
//  "(UY-PROSTA) ADS05 (API 3) › HOMEM › h1"           -> UY / PROSTA
//  "(CC) (PY-PROSTA) ADS03 (API 32) › HOMEM › H1"     -> PY / PROSTA
//  "(FIGADO-BR) AD01 (API 26) › HOMEM › AD1"          -> BR / FIGADO

export const COUNTRY_CODES = ['BR', 'UY', 'PY', 'MX', 'AR', 'CL', 'CO', 'PE', 'EC', 'BO', 'PT', 'ES', 'US'];

export const COUNTRY_LABEL: Record<string, string> = {
  BR: 'Brasil',
  UY: 'Uruguai',
  PY: 'Paraguai',
  MX: 'México',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colômbia',
  PE: 'Peru',
  EC: 'Equador',
  BO: 'Bolívia',
  PT: 'Portugal',
  ES: 'Espanha',
  US: 'EUA',
};

export interface AdOrigin {
  country: string | null; // BR, UY...
  niche: string | null;   // EMA, PROSTA, ADULTO, FIGADO...
  campaign: string | null;
}

export function countryLabel(code: string | null | undefined) {
  if (!code) return 'Sem país';
  return COUNTRY_LABEL[code] ?? code;
}

export function parseAdOrigin(adTitle: string | null | undefined): AdOrigin {
  const empty: AdOrigin = { country: null, niche: null, campaign: null };
  if (!adTitle) return empty;

  const campaign = adTitle.split('›')[0].trim() || null;

  // todos os grupos entre parênteses
  const groups = Array.from(adTitle.matchAll(/\(([^)]+)\)/g)).map((m) => m[1].trim().toUpperCase());

  for (const g of groups) {
    // ignora identificadores de API/WPP
    if (/^(API|WPP)\b/.test(g)) continue;
    const parts = g.split(/[-_\s]+/).filter(Boolean);
    if (parts.length < 2) continue;

    const countryIdx = parts.findIndex((p) => COUNTRY_CODES.includes(p));
    if (countryIdx === -1) continue;

    const country = parts[countryIdx];
    const niche = parts
      .filter((_, i) => i !== countryIdx)
      .filter((p) => !/^(API|WPP)$/.test(p) && !/^\d+$/.test(p))
      .join('-');

    if (niche) return { country, niche, campaign };
  }

  // fallback: grupo aberto sem fechar, ex: "(UY-ADULTO AD0102 (API meu)"
  const loose = adTitle.toUpperCase().match(/\(\s*([A-Z]{2})[-\s]([A-Z]+)/);
  if (loose && COUNTRY_CODES.includes(loose[1])) {
    return { country: loose[1], niche: loose[2], campaign };
  }
  const loose2 = adTitle.toUpperCase().match(/\(\s*([A-Z]+)[-\s]([A-Z]{2})\b/);
  if (loose2 && COUNTRY_CODES.includes(loose2[2])) {
    return { country: loose2[2], niche: loose2[1], campaign };
  }

  return { ...empty, campaign };
}

export function originKey(o: AdOrigin) {
  return `${o.country ?? 'SEM'}-${o.niche ?? 'SEM'}`;
}
