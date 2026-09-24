import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Layers, Loader2 } from 'lucide-react';
import TopBar from '@/components/layout/TopBar';
import KnowledgeBase from '@/components/ai/KnowledgeBase';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NicheOption {
  id: string;
  name: string;
}

export default function KnowledgeBasePage() {
  const { currentWorkspace } = useWorkspace();
  const [searchParams] = useSearchParams();
  const requestedNicheId = searchParams.get('niche') || '';
  const [niches, setNiches] = useState<NicheOption[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNiches = async () => {
      if (!currentWorkspace?.id) {
        setNiches([]);
        setSelectedNicheId('');
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data } = await supabase
        .from('niches')
        .select('id, name')
        .eq('workspace_id', currentWorkspace.id)
        .order('name');

      const nextNiches = (data || []) as NicheOption[];
      setNiches(nextNiches);
      setSelectedNicheId((current) =>
        nextNiches.some((niche) => niche.id === requestedNicheId)
          ? requestedNicheId
          : nextNiches.some((niche) => niche.id === current) ? current : nextNiches[0]?.id || '',
      );
      setLoading(false);
    };

    loadNiches();
  }, [currentWorkspace?.id, requestedNicheId]);

  return (
    <div>
      <TopBar
        title="Base de Conhecimento"
        subtitle="Cadastre as informações oficiais usadas pela Resposta Inteligente"
      />

      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <section className="rounded-lg border border-border bg-card p-5 shadow-elevated">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Layers className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-card-foreground">Nicho do conhecimento</h1>
              <p className="text-xs text-muted-foreground">
                Cada informação fica disponível somente para o nicho e país escolhidos.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-10 items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : niches.length > 0 ? (
            <Select value={selectedNicheId} onValueChange={setSelectedNicheId}>
              <SelectTrigger className="max-w-md" aria-label="Selecionar nicho">
                <SelectValue placeholder="Selecione um nicho" />
              </SelectTrigger>
              <SelectContent>
                {niches.map((niche) => (
                  <SelectItem key={niche.id} value={niche.id}>
                    {niche.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
              <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Crie um nicho em Nichos &amp; IA para começar a cadastrar informações.
              </p>
            </div>
          )}
        </section>

        {selectedNicheId && (
          <KnowledgeBase key={selectedNicheId} nicheId={selectedNicheId} textOnly />
        )}
      </div>
    </div>
  );
}