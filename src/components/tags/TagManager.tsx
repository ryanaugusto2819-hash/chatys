import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tag, Plus, Check, Loader2, Trash2 } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
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

  const deleteTag = async (tag: TagOption) => {
    if (deletingTagId) return;
    setDeletingTagId(tag.id);
    try {
      const { error: linksError } = await supabase
        .from('contact_tags')
        .delete()
        .eq('tag_id', tag.id);
      if (linksError) throw linksError;

      const { error: tagError } = await supabase
        .from('tags')
        .delete()
        .eq('id', tag.id);
      if (tagError) throw tagError;

      setAllTags(previous => previous.filter(item => item.id !== tag.id));
      onTagsChanged();
      toast.success(`Etiqueta "${tag.name}" excluída`);
    } catch {
      toast.error('Erro ao excluir etiqueta');
    } finally {
      setDeletingTagId(null);
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
                  disabled={loading || deletingTagId !== null}
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loading || deletingTagId !== null}
                      className="h-8 gap-1.5 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {deletingTagId === tag.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir etiqueta?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A etiqueta “{tag.name}” será removida de todas as conversas. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => void deleteTag(tag)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
