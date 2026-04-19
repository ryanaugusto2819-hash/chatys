import { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, Plus, ChevronRight, ChevronLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { betwise, betwiseEnabled } from '@/integrations/betwise/client';

type PipelineStage =
  | 'cadastro_pendente'
  | 'cadastro_feito'
  | 'deposito_pendente'
  | 'deposito_feito'
  | 'aposta_realizada'
  | 'segundo_deposito'
  | 'redeposito';

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: 'cadastro_pendente', label: 'Cadastro Pendente' },
  { id: 'cadastro_feito', label: 'Cadastro Feito' },
  { id: 'deposito_pendente', label: 'Dep. Pendente' },
  { id: 'deposito_feito', label: 'Dep. Feito' },
  { id: 'aposta_realizada', label: 'Apostou' },
  { id: 'segundo_deposito', label: '2º Depósito' },
  { id: 'redeposito', label: 'Redepósito' },
];

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  pipeline_stage: PipelineStage;
  status: string;
};

type Casa = { id: string; nome: string };

type Deposito = {
  id: string;
  lead_id: string;
  casa_id: string;
  valor: number;
  data_deposito: string;
};

type Cadastro = {
  id: string;
  lead_id: string;
  casa_id: string;
  status_cadastro: string;
};

interface BetLeadPanelProps {
  contactPhone: string;
  contactName: string;
}

export default function BetLeadPanel({ contactPhone, contactName }: BetLeadPanelProps) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositData, setDepositData] = useState({
    casa_id: '',
    valor: '',
    data_deposito: new Date().toISOString().split('T')[0],
  });
  const [savingDeposit, setSavingDeposit] = useState(false);

  const fetchLead = useCallback(async () => {
    if (!betwise) return;
    setLoading(true);

    const normalized = contactPhone.replace(/\D/g, '');
    const { data } = await betwise
      .from('leads')
      .select('id, nome, telefone, pipeline_stage, status')
      .or(`telefone.eq.${contactPhone},telefone.eq.${normalized},telefone.ilike.%${normalized}`)
      .maybeSingle();

    const [casasResult] = await Promise.all([
      betwise.from('casas_de_aposta').select('id, nome').order('nome'),
    ]);
    setCasas((casasResult.data || []) as Casa[]);

    if (data) {
      setLead(data as Lead);
      const [depositosResult, cadastrosResult] = await Promise.all([
        betwise.from('depositos').select('*').eq('lead_id', data.id).order('data_deposito', { ascending: false }),
        betwise.from('lead_cadastros').select('*').eq('lead_id', data.id),
      ]);
      setDepositos(
        ((depositosResult.data || []) as any[]).map(d => ({ ...d, valor: Number(d.valor) }))
      );
      setCadastros((cadastrosResult.data || []) as Cadastro[]);
    } else {
      setLead(null);
      setDepositos([]);
      setCadastros([]);
    }

    setLoading(false);
  }, [contactPhone]);

  useEffect(() => {
    if (contactPhone) fetchLead();
  }, [contactPhone, fetchLead]);

  const handleCreateLead = async () => {
    if (!betwise || !createName.trim()) return;
    setCreating(true);
    const { data, error } = await betwise
      .from('leads')
      .insert({
        nome: createName.trim(),
        telefone: contactPhone,
        pipeline_stage: 'cadastro_pendente',
        status: 'ativo',
        tags: [],
      })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar card no Kanban');
    } else {
      setLead(data as Lead);
      setShowCreateForm(false);
      setCreateName('');
      toast.success('Card criado no Kanban!');
    }
    setCreating(false);
  };

  const handleMoveStage = async (newStage: PipelineStage) => {
    if (!lead || !betwise || movingStage || newStage === lead.pipeline_stage) return;
    setMovingStage(true);
    const { error } = await betwise.from('leads').update({ pipeline_stage: newStage }).eq('id', lead.id);
    if (error) {
      toast.error('Erro ao mover lead');
    } else {
      setLead(prev => (prev ? { ...prev, pipeline_stage: newStage } : null));
      toast.success(`Lead → ${STAGES.find(s => s.id === newStage)?.label}`);
    }
    setMovingStage(false);
  };

  const handleDeleteLead = async () => {
    if (!lead || !betwise) return;
    setDeleting(true);
    const { error } = await betwise.from('leads').delete().eq('id', lead.id);
    if (error) {
      toast.error('Erro ao excluir card');
    } else {
      setLead(null);
      setDepositos([]);
      setCadastros([]);
      setConfirmDelete(false);
      toast.success('Card excluído do Kanban');
    }
    setDeleting(false);
  };

  const handleSaveDeposit = async () => {
    if (!lead || !betwise || !depositData.casa_id || !depositData.valor) return;
    setSavingDeposit(true);
    const numDeposit = depositos.filter(d => d.casa_id === depositData.casa_id).length + 1;
    const { error } = await betwise.from('depositos').insert({
      lead_id: lead.id,
      casa_id: depositData.casa_id,
      valor: parseFloat(depositData.valor.replace(',', '.')),
      data_deposito: depositData.data_deposito,
      numero_deposito: numDeposit,
      origem: 'lead',
    });
    if (error) {
      toast.error('Erro ao registrar depósito');
    } else {
      toast.success('Depósito registrado!');
      setShowDepositForm(false);
      setDepositData({ casa_id: '', valor: '', data_deposito: new Date().toISOString().split('T')[0] });
      fetchLead();
    }
    setSavingDeposit(false);
  };

  if (!betwiseEnabled) return null;

  const currentIdx = lead ? STAGES.findIndex(s => s.id === lead.pipeline_stage) : -1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3" /> Betwise — Kanban
        </p>
        {lead && (
          confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Excluir?</span>
              <button
                onClick={handleDeleteLead}
                disabled={deleting}
                className="text-[10px] font-semibold text-destructive hover:underline"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sim'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-muted-foreground hover:underline"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
              title="Excluir card"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )
        )}
      </div>
      <div className="rounded-lg border border-border bg-background/50 p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !lead ? (
          !showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-3 text-xs font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Criar Card no Kanban
            </button>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Nome do Lead *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="Digite o nome..."
                  autoFocus
                  className="w-full mt-0.5 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Telefone</label>
                <input
                  type="text"
                  value={contactPhone}
                  readOnly
                  className="w-full mt-0.5 rounded-md border border-input bg-muted px-2 py-1.5 text-xs text-muted-foreground"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setShowCreateForm(false); setCreateName(''); }}
                  className="flex-1 rounded-md border border-border py-1.5 text-[10px] text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateLead}
                  disabled={!createName.trim() || creating}
                  className="flex-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 text-[10px] font-medium transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Criar Card'}
                </button>
              </div>
            </div>
          )
        ) : (
          <>
            {/* Stage navigation */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Etapa no Kanban</p>
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => currentIdx > 0 && handleMoveStage(STAGES[currentIdx - 1].id)}
                  disabled={currentIdx <= 0 || movingStage}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="flex-1 text-center text-xs font-semibold text-card-foreground truncate">
                  {movingStage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
                  ) : (
                    STAGES.find(s => s.id === lead.pipeline_stage)?.label
                  )}
                </span>
                <button
                  onClick={() => currentIdx < STAGES.length - 1 && handleMoveStage(STAGES[currentIdx + 1].id)}
                  disabled={currentIdx >= STAGES.length - 1 || movingStage}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Stage pills — jump to any stage */}
              <div className="flex flex-wrap gap-1 mt-2">
                {STAGES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleMoveStage(s.id)}
                    disabled={movingStage || s.id === lead.pipeline_stage}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      s.id === lead.pipeline_stage
                        ? 'bg-primary text-primary-foreground cursor-default'
                        : 'bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Deposits */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-muted-foreground">Depósitos</p>
                <button
                  onClick={() => setShowDepositForm(v => !v)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" /> Registrar
                </button>
              </div>

              {depositos.length > 0 ? (
                <div className="space-y-1">
                  {depositos.map(d => {
                    const casa = casas.find(c => c.id === d.casa_id);
                    return (
                      <div key={d.id} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground truncate max-w-[110px]">{casa?.nome ?? '—'}</span>
                        <span className="font-medium text-card-foreground">
                          R$ {d.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Nenhum depósito registrado</p>
              )}

              {showDepositForm && (
                <div className="mt-2 rounded-lg border border-border bg-background p-2.5 space-y-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Casa de Aposta</label>
                    <select
                      value={depositData.casa_id}
                      onChange={e => setDepositData(p => ({ ...p, casa_id: e.target.value }))}
                      className="w-full mt-0.5 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Selecionar...</option>
                      {casas.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Valor (R$)</label>
                      <input
                        type="text"
                        value={depositData.valor}
                        onChange={e => setDepositData(p => ({ ...p, valor: e.target.value }))}
                        placeholder="0,00"
                        className="w-full mt-0.5 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Data</label>
                      <input
                        type="date"
                        value={depositData.data_deposito}
                        onChange={e => setDepositData(p => ({ ...p, data_deposito: e.target.value }))}
                        className="w-full mt-0.5 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setShowDepositForm(false)}
                      className="flex-1 rounded-md border border-border py-1 text-[10px] text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveDeposit}
                      disabled={!depositData.casa_id || !depositData.valor || savingDeposit}
                      className="flex-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground py-1 text-[10px] font-medium transition-colors disabled:opacity-50"
                    >
                      {savingDeposit ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Salvar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cadastros */}
            {cadastros.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Cadastros nas Casas</p>
                  <div className="space-y-1">
                    {cadastros.map(c => {
                      const casa = casas.find(cas => cas.id === c.casa_id);
                      return (
                        <div key={c.id} className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground truncate max-w-[110px]">{casa?.nome ?? '—'}</span>
                          <span className={`font-medium ${
                            c.status_cadastro === 'feito'
                              ? 'text-green-500'
                              : c.status_cadastro === 'erro'
                                ? 'text-destructive'
                                : 'text-yellow-500'
                          }`}>
                            {c.status_cadastro === 'feito' ? '✓ Feito' : c.status_cadastro === 'erro' ? '✗ Erro' : '⏳ Pendente'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
