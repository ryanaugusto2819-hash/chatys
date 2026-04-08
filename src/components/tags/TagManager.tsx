import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tag, Plus, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface ContactTag {
  id: string;
  tag: TagOption;
}

interface TagManagerProps {
  contactPhone: string;
  contactTags: ContactTag[];
  onTagsChanged: () => void;
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

export default function TagManager({ contactPhone, contactTags, onTagsChanged }: TagManagerProps) {
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchAllTags = async () => {
    const { data } = await supabase.from('tags').select('id, name, color');
    if (data) setAllTags(data);
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchAllTags();
      setShowCreateForm(false);
      setNewTagName('');
    }
  };

  const isTagAssigned = (tagId: string) => contactTags.some(ct => ct.tag.id === tagId);

  const toggleTag = async (tag: TagOption) => {
    setLoading(true);
    try {
      if (isTagAssigned(tag.id)) {
        const ct = contactTags.find(ct => ct.tag.id === tag.id);
        if (ct) {
          await supabase.from('contact_tags').delete().eq('id', ct.id);
          toast.success(`Etiqueta "${tag.name}" removida`);
        }
      } else {
        await supabase.from('contact_tags').insert({ contact_phone: contactPhone, tag_id: tag.id });
        toast.success(`Etiqueta "${tag.name}" adicionada`);
      }
      onTagsChanged();
    } catch {
      toast.error('Erro ao alterar etiqueta');
    } finally {
      setLoading(false);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({ name: newTagName.trim(), color: newTagColor })
        .select('id, name, color')
        .single();

      if (error) throw error;
      if (data) {
        setAllTags(prev => [...prev, data]);
        // Auto-assign to contact
        await supabase.from('contact_tags').insert({ contact_phone: contactPhone, tag_id: data.id });
        onTagsChanged();
        toast.success(`Etiqueta "${data.name}" criada e adicionada`);
        setNewTagName('');
        setShowCreateForm(false);
      }
    } catch {
      toast.error('Erro ao criar etiqueta');
    } finally {
      setCreating(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
          <Plus className="h-3 w-3" />
          Gerenciar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Gerenciar Etiquetas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing tags list */}
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {allTags.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma etiqueta criada</p>
            )}
            {allTags.map(tag => (
              <div
                key={tag.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-secondary/40 transition-colors group"
              >
                <button
                  onClick={() => toggleTag(tag)}
                  disabled={loading}
                  className="flex items-center gap-2.5 flex-1 min-w-0"
                >
                  <div
                    className="h-4 w-4 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: tag.color }}
                  >
                    {isTagAssigned(tag.id) && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-sm truncate">{tag.name}</span>
                </button>
                <button
                  onClick={() => deleteTag(tag)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                  title="Excluir etiqueta"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Create new tag */}
          {showCreateForm ? (
            <div className="space-y-3 rounded-lg border border-border p-3 bg-secondary/20">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nome da etiqueta"
                className="h-9"
                onKeyDown={(e) => { if (e.key === 'Enter') createTag(); }}
              />
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      outline: newTagColor === color ? '2px solid currentColor' : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={createTag} disabled={creating || !newTagName.trim()} className="flex-1">
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Criar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm(true)}
              className="w-full gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Criar nova etiqueta
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
