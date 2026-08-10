import { useMemo, useState } from 'react';
import { useLeadExtraction, type LeadRow } from '@/hooks/useLeadExtraction';
import { countryLabel } from '@/lib/adNiche';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Download, Loader2, Users, Filter, RefreshCw, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function onlyDigits(p: string) {
  return (p || '').replace(/\D/g, '');
}

function download(filename: string, content: string, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


function DatePicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const date = value ? parseISO(value) : undefined;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : <span>dd/mm/aaaa</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              onChange(d ? format(d, 'yyyy-MM-dd') : '');
              setOpen(false);
            }}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}


export default function LeadExtraction() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [country, setCountry] = useState('all');
  const [niche, setNiche] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyAds, setOnlyAds] = useState(true);
  const [dedupe, setDedupe] = useState(true);

  const { data, isLoading, isFetching, refetch } = useLeadExtraction(
    from ? new Date(from).toISOString() : null,
    to ? new Date(new Date(to).getTime() + 86399000).toISOString() : null,
  );

  const leads = data ?? [];

  const countries = useMemo(
    () => Array.from(new Set(leads.map((l) => l.origin.country).filter(Boolean) as string[])).sort(),
    [leads],
  );
  const niches = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .filter((l) => country === 'all' || l.origin.country === country)
            .map((l) => l.origin.niche)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [leads, country],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sDigits = onlyDigits(search);
    let out = leads.filter((l) => {
      if (onlyAds && !l.origin.niche) return false;
      if (country !== 'all' && l.origin.country !== country) return false;
      if (niche !== 'all' && l.origin.niche !== niche) return false;
      if (s) {
        const matchName = l.contact_name?.toLowerCase().includes(s);
        const matchPhone = sDigits && onlyDigits(l.contact_phone).includes(sDigits);
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
    if (dedupe) {
      const seen = new Set<string>();
      out = out.filter((l) => {
        const k = onlyDigits(l.contact_phone);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return out;
  }, [leads, onlyAds, country, niche, search, dedupe]);

  const groups = useMemo(() => {
    const map = new Map<string, { country: string | null; niche: string | null; count: number }>();
    for (const l of filtered) {
      const k = l.key;
      if (!map.has(k)) map.set(k, { country: l.origin.country, niche: l.origin.niche, count: 0 });
      map.get(k)!.count++;
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const exportCsv = (rows: LeadRow[], suffix: string) => {
    if (rows.length === 0) return toast.error('Nenhum lead para exportar');
    const header = ['nome', 'telefone', 'pais', 'nicho', 'campanha', 'anuncio', 'data'];
    const lines = rows.map((l) =>
      [
        l.contact_name ?? '',
        onlyDigits(l.contact_phone),
        l.origin.country ?? '',
        l.origin.niche ?? '',
        l.origin.campaign ?? '',
        l.ad_title ?? '',
        new Date(l.created_at).toLocaleString('pt-BR'),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    download(`leads-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'));
    toast.success(`${rows.length} leads exportados`);
  };

  const exportPhones = (rows: LeadRow[], suffix: string) => {
    if (rows.length === 0) return toast.error('Nenhum lead para exportar');
    download(
      `numeros-${suffix}-${new Date().toISOString().slice(0, 10)}.txt`,
      rows.map((l) => onlyDigits(l.contact_phone)).join('\n'),
      'text/plain;charset=utf-8;',
    );
    toast.success(`${rows.length} números exportados`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Extração de Leads</h1>
          <p className="text-sm text-muted-foreground">
            Leads separados por nicho e país, identificados pela nomenclatura do anúncio.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => exportPhones(filtered, 'numeros')}>
            <Download className="h-4 w-4 mr-2" /> Só números (.txt)
          </Button>
          <Button onClick={() => exportCsv(filtered, 'filtrados')}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <DatePicker label="De" value={from} onChange={setFrom} />
          <DatePicker label="Até" value={to} onChange={setTo} />
          <div className="space-y-1.5">
            <Label>País</Label>
            <Select value={country} onValueChange={(v) => { setCountry(v); setNiche('all'); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>{countryLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nicho</Label>
            <Select value={niche} onValueChange={setNiche}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {niches.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Buscar</Label>
            <Input placeholder="Nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <Switch checked={onlyAds} onCheckedChange={setOnlyAds} id="onlyAds" />
              <Label htmlFor="onlyAds" className="text-xs">Só com nicho</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={dedupe} onCheckedChange={setDedupe} id="dedupe" />
              <Label htmlFor="dedupe" className="text-xs">Sem duplicados</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((g) => (
              <Card key={g.key} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{countryLabel(g.country)}</Badge>
                    <span className="text-xs text-muted-foreground">{g.niche ?? 'Sem nicho'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">{g.count.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => exportCsv(filtered.filter((l) => l.key === g.key), g.key)}
                    >
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => exportPhones(filtered.filter((l) => l.key === g.key), g.key)}
                    >
                      Números
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {filtered.length.toLocaleString('pt-BR')} leads · exibindo os primeiros 300
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>País</TableHead>
                    <TableHead>Nicho</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 300).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-[180px] truncate">{l.contact_name}</TableCell>
                      <TableCell className="font-mono text-xs">{onlyDigits(l.contact_phone)}</TableCell>
                      <TableCell>{countryLabel(l.origin.country)}</TableCell>
                      <TableCell>{l.origin.niche ?? '—'}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-muted-foreground text-xs">
                        {l.origin.campaign ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                        Nenhum lead encontrado com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
