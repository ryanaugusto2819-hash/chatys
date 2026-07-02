export type SectorValue = 'comercial' | 'pos_venda' | 'cobranca';

export const SECTORS: { value: SectorValue; label: string }[] = [
  { value: 'comercial', label: 'Comercial' },
  { value: 'pos_venda', label: 'Pós-Venda' },
  { value: 'cobranca', label: 'Cobrança' },
];

export const SECTOR_LABEL: Record<string, string> = {
  comercial: 'Comercial',
  pos_venda: 'Pós-Venda',
  cobranca: 'Cobrança',
};

export function sectorLabel(v: string | null | undefined): string {
  if (!v) return 'Sem setor';
  return SECTOR_LABEL[v] ?? v;
}
