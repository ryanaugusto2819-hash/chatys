import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Plus, Trash2, Upload, FileText, MessageSquare, Loader2, Workflow, Check, Tag, Pencil, Save, ImagePlus, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface KBItem {
  id: string;
  type: string;
  title: string;
  content: string;
  file_url: string | null;
  niche_id: string | null;
  country_code: string;
  created_at: string;
  tag_ids: string[];
  images: KBImage[];
}

interface KBImage {
  id: string;
  image_url: string;
  storage_path: string;
  description: string;
  mime_type: string;
  sort_order: number;
}

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
  description: string;
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface FlowWithNodes {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  nodes: { node_type: string; label: string; config: any; sort_order: number }[];
}

type TabType = 'text' | 'qa' | 'file' | 'flows';

interface Props {
  nicheId?: string;
  textOnly?: boolean;
}

export default function KnowledgeBase({ nicheId, textOnly = false }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<KBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [editingItem, setEditingItem] = useState<KBItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCountryCode, setEditCountryCode] = useState('any');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [editNewImages, setEditNewImages] = useState<PendingImage[]>([]);
  const [editExistingImages, setEditExistingImages] = useState<KBImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);

  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [countryCode, setCountryCode] = useState('any');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItems();
  }, [nicheId, currentWorkspace?.id]);

  useEffect(() => {
    if (!currentWorkspace?.id) {
      setTags([]);
      setSelectedTagIds([]);
      return;
    }
    supabase
      .from('tags')
      .select('id, name, color')
      .eq('workspace_id', currentWorkspace.id)
      .order('name')
      .then(({ data }) => setTags((data || []) as TagOption[]));
  }, [currentWorkspace?.id]);

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase
      .from('knowledge_base_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentWorkspace?.id) {
      query = query.eq('workspace_id', currentWorkspace.id);
    }

    if (nicheId) {
      query = query.eq('niche_id', nicheId);
    } else {
      query = query.is('niche_id', null);
    }

    const { data } = await query;
    const baseItems = data || [];
    const itemIds = baseItems.map((item) => item.id);
    const { data: links } = itemIds.length > 0
      ? await supabase
          .from('knowledge_base_item_tags')
          .select('knowledge_base_item_id, tag_id')
          .in('knowledge_base_item_id', itemIds)
      : { data: [] };
    const { data: imageRows } = itemIds.length > 0
      ? await supabase
          .from('knowledge_base_item_images')
          .select('id, knowledge_base_item_id, image_url, storage_path, description, mime_type, sort_order')
          .in('knowledge_base_item_id', itemIds)
          .order('sort_order')
      : { data: [] };
    const tagIdsByItem = new Map<string, string[]>();
    for (const link of links || []) {
      const current = tagIdsByItem.get(link.knowledge_base_item_id) || [];
      current.push(link.tag_id);
      tagIdsByItem.set(link.knowledge_base_item_id, current);
    }
    const imagesByItem = new Map<string, KBImage[]>();
    for (const image of imageRows || []) {
      const current = imagesByItem.get(image.knowledge_base_item_id) || [];
      current.push(image as KBImage);
      imagesByItem.set(image.knowledge_base_item_id, current);
    }
    setItems(baseItems.map((item) => ({
      ...item,
      tag_ids: tagIdsByItem.get(item.id) || [],
      images: imagesByItem.get(item.id) || [],
    })) as KBItem[]);
    setLoading(false);
  };

  const saveItemTags = async (itemId: string, tagIds: string[]) => {
    if (!currentWorkspace?.id || tagIds.length === 0) return null;
    const { error } = await supabase.from('knowledge_base_item_tags').insert(
      tagIds.map((tagId) => ({
        knowledge_base_item_id: itemId,
        tag_id: tagId,
        workspace_id: currentWorkspace.id,
      })),
    );
    return error;
  };

  const toggleSelectedTag = (tagId: string) => {
    setSelectedTagIds((current) => current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]);
  };

  const addPendingImages = (files: FileList | null, editing = false) => {
    if (!files) return;
    const currentCount = editing ? editExistingImages.length + editNewImages.length : pendingImages.length;
    const available = Math.max(0, 5 - currentCount);
    const accepted = Array.from(files).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (accepted.length !== files.length) toast.error('Use imagens JPG, PNG ou WEBP');
    if (accepted.some((file) => file.size > 5 * 1024 * 1024)) {
      toast.error('Cada imagem deve ter no máximo 5MB');
    }
    const additions = accepted
      .filter((file) => file.size <= 5 * 1024 * 1024)
      .slice(0, available)
      .map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), description: '' }));
    if (accepted.length > available) toast.error('Cada conteúdo pode ter no máximo 5 imagens');
    if (editing) setEditNewImages((current) => [...current, ...additions]);
    else setPendingImages((current) => [...current, ...additions]);
  };

  const updatePendingDescription = (id: string, description: string, editing = false) => {
    const setter = editing ? setEditNewImages : setPendingImages;
    setter((current) => current.map((image) => image.id === id ? { ...image, description } : image));
  };

  const removePendingImage = (id: string, editing = false) => {
    const setter = editing ? setEditNewImages : setPendingImages;
    setter((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  };

  const uploadItemImages = async (itemId: string, images: PendingImage[], startOrder = 0) => {
    if (!currentWorkspace?.id || images.length === 0) return null;
    const rows = [];
    for (const [index, image] of images.entries()) {
      const extension = image.file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${currentWorkspace.id}/${itemId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('knowledge-base').upload(storagePath, image.file, {
        contentType: image.file.type,
        upsert: false,
      });
      if (uploadError) return uploadError;
      const { data: publicUrl } = supabase.storage.from('knowledge-base').getPublicUrl(storagePath);
      rows.push({
        knowledge_base_item_id: itemId,
        workspace_id: currentWorkspace.id,
        image_url: publicUrl.publicUrl,
        storage_path: storagePath,
        description: image.description.trim(),
        mime_type: image.file.type,
        sort_order: startOrder + index,
      });
    }
    const { error } = await supabase.from('knowledge_base_item_images').insert(rows);
    return error;
  };

  const toggleItemTag = async (item: KBItem, tagId: string) => {
    if (!currentWorkspace?.id) return;
    const isSelected = item.tag_ids.includes(tagId);
    setItems((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, tag_ids: isSelected ? entry.tag_ids.filter((id) => id !== tagId) : [...entry.tag_ids, tagId] }
      : entry));
    const { error } = isSelected
      ? await supabase.from('knowledge_base_item_tags').delete()
          .eq('knowledge_base_item_id', item.id).eq('tag_id', tagId).eq('workspace_id', currentWorkspace.id)
      : await supabase.from('knowledge_base_item_tags').insert({
          knowledge_base_item_id: item.id, tag_id: tagId, workspace_id: currentWorkspace.id,
        });
    if (error) {
      toast.error('Não foi possível atualizar as etiquetas');
      fetchItems();
    }
  };

  const addTextItem = async () => {
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }
    if (!textTitle.trim() || !textContent.trim()) {
      toast.error('Preencha título e conteúdo');
      return;
    }
    const { data: created, error } = await supabase.from('knowledge_base_items').insert({
      type: 'text',
      title: textTitle.trim(),
      content: textContent.trim(),
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    }).select('id').single();
    if (error) {
      toast.error('Erro ao adicionar');
    } else if (created) {
      const [tagError, imageError] = await Promise.all([
        saveItemTags(created.id, selectedTagIds),
        uploadItemImages(created.id, pendingImages),
      ]);
      if (tagError || imageError) {
        toast.error(`Conteúdo criado, mas alguns anexos falharam: ${tagError?.message || imageError?.message}`);
        fetchItems();
        return;
      }
      toast.success('Conhecimento adicionado');
      setTextTitle('');
      setTextContent('');
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setPendingImages([]);
      fetchItems();
    }
  };

  const addQAItem = async () => {
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }
    if (!qaQuestion.trim() || !qaAnswer.trim()) {
      toast.error('Preencha pergunta e resposta');
      return;
    }
    const { data: created, error } = await supabase.from('knowledge_base_items').insert({
      type: 'qa',
      title: qaQuestion.trim(),
      content: qaAnswer.trim(),
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    }).select('id').single();
    if (error) {
      toast.error('Erro ao adicionar');
    } else if (created) {
      const [tagError, imageError] = await Promise.all([
        saveItemTags(created.id, selectedTagIds),
        uploadItemImages(created.id, pendingImages),
      ]);
      if (tagError || imageError) {
        toast.error(`Conteúdo criado, mas alguns anexos falharam: ${tagError?.message || imageError?.message}`);
        fetchItems();
        return;
      }
      toast.success('Pergunta e resposta adicionadas');
      setQaQuestion('');
      setQaAnswer('');
      pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setPendingImages([]);
      fetchItems();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande (máx 10MB)');
      return;
    }

    setUploading(true);
    const fileName = `${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('knowledge-base')
      .upload(fileName, file);

    if (uploadError) {
      toast.error('Erro ao enviar arquivo');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('knowledge-base')
      .getPublicUrl(fileName);

    let content = '';
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    if (textTypes.includes(file.type) || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      content = await file.text();
    } else {
      content = `[Arquivo: ${file.name}]`;
    }

    const { data: created, error } = await supabase.from('knowledge_base_items').insert({
      type: 'file',
      title: file.name,
      content: content.substring(0, 50000),
      file_url: urlData.publicUrl,
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    }).select('id').single();

    if (error) {
      toast.error('Erro ao salvar referência do arquivo');
    } else if (created) {
      const tagError = await saveItemTags(created.id, selectedTagIds);
      if (tagError) {
        toast.error('Arquivo salvo, mas não foi possível vincular as etiquetas');
      } else {
        toast.success('Arquivo enviado com sucesso');
      }
      fetchItems();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteItem = async (item: KBItem) => {
    if (item.images.length > 0) {
      await supabase.storage.from('knowledge-base').remove(item.images.map((image) => image.storage_path));
    }
    if (item.file_url) {
      const fileName = item.file_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('knowledge-base').remove([fileName]);
      }
    }

    const { error } = await supabase
      .from('knowledge_base_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      toast.error('Erro ao excluir');
    } else {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success('Item excluído');
    }
  };

  const openEditItem = (item: KBItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditCountryCode(item.country_code || 'any');
    setEditTagIds(item.tag_ids);
    setEditExistingImages(item.images);
    setEditNewImages([]);
    setRemovedImageIds([]);
  };

  const toggleEditTag = (tagId: string) => {
    setEditTagIds((current) => current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]);
  };

  const saveEditedItem = async () => {
    if (!editingItem || !currentWorkspace?.id) return;
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error('Preencha título e conteúdo');
      return;
    }

    setSavingEdit(true);
    const { error: itemError } = await supabase
      .from('knowledge_base_items')
      .update({
        title: editTitle.trim(),
        content: editContent.trim().substring(0, 50000),
        country_code: editCountryCode,
      })
      .eq('id', editingItem.id)
      .eq('workspace_id', currentWorkspace.id);

    if (itemError) {
      toast.error(`Não foi possível salvar: ${itemError.message}`);
      setSavingEdit(false);
      return;
    }

    const previousTags = new Set(editingItem.tag_ids);
    const nextTags = new Set(editTagIds);
    const tagsToAdd = editTagIds.filter((tagId) => !previousTags.has(tagId));
    const tagsToRemove = editingItem.tag_ids.filter((tagId) => !nextTags.has(tagId));

    const [removeResult, addResult] = await Promise.all([
      tagsToRemove.length
        ? supabase.from('knowledge_base_item_tags').delete()
            .eq('knowledge_base_item_id', editingItem.id)
            .eq('workspace_id', currentWorkspace.id)
            .in('tag_id', tagsToRemove)
        : Promise.resolve({ error: null }),
      tagsToAdd.length
        ? supabase.from('knowledge_base_item_tags').insert(tagsToAdd.map((tagId) => ({
            knowledge_base_item_id: editingItem.id,
            tag_id: tagId,
            workspace_id: currentWorkspace.id,
          })))
        : Promise.resolve({ error: null }),
    ]);

    if (removeResult.error || addResult.error) {
      toast.error('O conteúdo foi salvo, mas algumas etiquetas não foram atualizadas');
      await fetchItems();
      setSavingEdit(false);
      return;
    }

    const imagesToDelete = editingItem.images.filter((image) => removedImageIds.includes(image.id));
    if (imagesToDelete.length > 0) {
      const { error: deleteRowsError } = await supabase.from('knowledge_base_item_images')
        .delete().eq('knowledge_base_item_id', editingItem.id).in('id', removedImageIds);
      if (deleteRowsError) {
        toast.error(`O texto foi salvo, mas não foi possível remover imagens: ${deleteRowsError.message}`);
        setSavingEdit(false);
        return;
      }
      await supabase.storage.from('knowledge-base').remove(imagesToDelete.map((image) => image.storage_path));
    }
    const retainedImages = editExistingImages.filter((image) => !removedImageIds.includes(image.id));
    const descriptionUpdates = retainedImages.map((image, index) => supabase.from('knowledge_base_item_images')
      .update({ description: image.description.trim(), sort_order: index })
      .eq('id', image.id).eq('workspace_id', currentWorkspace.id));
    const descriptionResults = await Promise.all(descriptionUpdates);
    const descriptionError = descriptionResults.find((result) => result.error)?.error;
    const imageUploadError = await uploadItemImages(editingItem.id, editNewImages, retainedImages.length);
    if (descriptionError || imageUploadError) {
      toast.error(`O texto foi salvo, mas algumas imagens falharam: ${descriptionError?.message || imageUploadError?.message}`);
      await fetchItems();
      setSavingEdit(false);
      return;
    }

    setItems((current) => current.map((item) => item.id === editingItem.id
      ? {
          ...item,
          title: editTitle.trim(),
          content: editContent.trim().substring(0, 50000),
          country_code: editCountryCode,
          tag_ids: editTagIds,
        }
      : item));
    setEditingItem(null);
    editNewImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setEditNewImages([]);
    setRemovedImageIds([]);
    setSavingEdit(false);
    toast.success('Conhecimento atualizado');
  };

  const [flows, setFlows] = useState<FlowWithNodes[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [importingFlowId, setImportingFlowId] = useState<string | null>(null);

  const fetchFlows = async () => {
    if (!nicheId) return;
    setLoadingFlows(true);
    const { data: flowData } = await supabase
      .from('automation_flows')
      .select('id, name, description, is_active')
      .eq('niche_id', nicheId)
      .order('name');

    if (flowData && flowData.length > 0) {
      const flowIds = flowData.map(f => f.id);
      const { data: nodesData } = await supabase
        .from('automation_nodes')
        .select('flow_id, node_type, label, config, sort_order')
        .in('flow_id', flowIds)
        .order('sort_order');

      const mapped: FlowWithNodes[] = flowData.map(f => ({
        ...f,
        nodes: (nodesData || []).filter(n => n.flow_id === f.id),
      }));
      setFlows(mapped);
    } else {
      setFlows([]);
    }
    setLoadingFlows(false);
  };

  useEffect(() => {
    if (activeTab === 'flows') fetchFlows();
  }, [activeTab, nicheId]);

  const formatFlowAsKnowledge = (flow: FlowWithNodes): string => {
    const lines: string[] = [];
    lines.push(`Fluxo: ${flow.name}`);
    if (flow.description) lines.push(`Descrição: ${flow.description}`);
    lines.push(`Status: ${flow.is_active ? 'Ativo' : 'Inativo'}`);
    lines.push(`Total de etapas: ${flow.nodes.length}`);
    lines.push('');
    lines.push('--- ETAPAS DO FLUXO ---');

    for (const node of flow.nodes) {
      lines.push('');
      lines.push(`[${node.sort_order + 1}] ${node.label} (${node.node_type})`);
      const cfg = node.config as Record<string, any> || {};

      if (node.node_type === 'message' || node.node_type === 'text') {
        if (cfg.text) lines.push(`  Mensagem: ${cfg.text}`);
        if (cfg.mediaUrl) lines.push(`  Mídia: ${cfg.mediaUrl}`);
        if (cfg.mediaType) lines.push(`  Tipo de mídia: ${cfg.mediaType}`);
      } else if (node.node_type === 'delay') {
        lines.push(`  Atraso: ${cfg.delay || cfg.seconds || 0}s`);
      } else if (node.node_type === 'set_funnel_stage') {
        lines.push(`  Define etapa do funil: ${cfg.stage || cfg.stageKey || 'N/A'}`);
      } else if (node.node_type === 'tag') {
        lines.push(`  Etiqueta: ${cfg.tagName || cfg.tag || 'N/A'}`);
      } else if (node.node_type === 'webhook') {
        lines.push(`  Webhook URL: ${cfg.url || 'N/A'}`);
      } else if (node.node_type === 'quick_reply') {
        lines.push(`  Resposta rápida: ${cfg.text || ''}`);
        if (cfg.buttons) lines.push(`  Botões: ${JSON.stringify(cfg.buttons)}`);
      } else {
        const cfgStr = JSON.stringify(cfg);
        if (cfgStr !== '{}') lines.push(`  Config: ${cfgStr}`);
      }
    }

    return lines.join('\n');
  };

  const importFlow = async (flow: FlowWithNodes) => {
    if (!currentWorkspace?.id) return;
    setImportingFlowId(flow.id);
    const content = formatFlowAsKnowledge(flow);
    const { data: created, error } = await supabase.from('knowledge_base_items').insert({
      type: 'text',
      title: `Fluxo: ${flow.name}`,
      content: content.substring(0, 50000),
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    }).select('id').single();
    if (error) {
      toast.error('Erro ao importar fluxo');
    } else if (created) {
      const tagError = await saveItemTags(created.id, selectedTagIds);
      if (tagError) {
        toast.error('Fluxo importado, mas não foi possível vincular as etiquetas');
        fetchItems();
        setImportingFlowId(null);
        return;
      }
      toast.success(`Fluxo "${flow.name}" adicionado à base de conhecimento`);
      fetchItems();
    }
    setImportingFlowId(null);
  };

  const importAllFlows = async () => {
    if (flows.length === 0 || !currentWorkspace?.id) return;
    setImportingFlowId('all');
    let success = 0;
    for (const flow of flows) {
      const content = formatFlowAsKnowledge(flow);
      const { data: created, error } = await supabase.from('knowledge_base_items').insert({
        type: 'text',
        title: `Fluxo: ${flow.name}`,
        content: content.substring(0, 50000),
        niche_id: nicheId || null,
        workspace_id: currentWorkspace?.id,
        country_code: countryCode,
      }).select('id').single();
      if (!error && created) {
        const tagError = await saveItemTags(created.id, selectedTagIds);
        if (!tagError) success++;
      }
    }
    toast.success(`${success} fluxo(s) importado(s) com sucesso`);
    fetchItems();
    setImportingFlowId(null);
  };

  const isFlowAlreadyImported = (flowName: string) =>
    items.some(i => i.title === `Fluxo: ${flowName}`);

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'text', label: 'Texto Livre', icon: <FileText className="h-3.5 w-3.5" /> },
    { key: 'qa', label: 'Perguntas e Respostas', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { key: 'file', label: 'Arquivos', icon: <Upload className="h-3.5 w-3.5" /> },
    ...(nicheId ? [{ key: 'flows' as TabType, label: 'Fluxos', icon: <Workflow className="h-3.5 w-3.5" /> }] : []),
  ];

  const typeIcon = (type: string) => {
    if (type === 'qa') return <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />;
    if (type === 'file') return <Upload className="h-3.5 w-3.5 text-primary shrink-0" />;
    return <FileText className="h-3.5 w-3.5 text-primary shrink-0" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'qa') return 'P&R';
    if (type === 'file') return 'Arquivo';
    return 'Texto';
  };

  const imageEditor = (existing: KBImage[], pending: PendingImage[], editing = false) => (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Imagens para enviar ao lead</p>
          <p className="mt-1 text-xs text-muted-foreground">Até 5 imagens JPG, PNG ou WEBP. Escreva quando cada imagem deve ser usada.</p>
        </div>
        <label className="shrink-0">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            disabled={existing.length + pending.length >= 5}
            onChange={(event) => {
              addPendingImages(event.target.files, editing);
              event.target.value = '';
            }}
          />
          <Button type="button" variant="outline" size="sm" asChild disabled={existing.length + pending.length >= 5}>
            <span className="cursor-pointer"><ImagePlus className="h-4 w-4" /> Anexar imagens</span>
          </Button>
        </label>
      </div>
      {(existing.length > 0 || pending.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {existing.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-md border border-border bg-card">
              <div className="relative aspect-video bg-muted">
                <img src={image.image_url} alt={image.description || 'Imagem da base'} className="h-full w-full object-contain" />
                {editing && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute right-2 top-2 h-7 w-7"
                    onClick={() => {
                      setEditExistingImages((current) => current.filter((entry) => entry.id !== image.id));
                      setRemovedImageIds((current) => [...current, image.id]);
                    }}
                    aria-label="Remover imagem"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {editing ? (
                <textarea
                  value={image.description}
                  onChange={(event) => setEditExistingImages((current) => current.map((entry) => entry.id === image.id ? { ...entry, description: event.target.value } : entry))}
                  maxLength={500}
                  rows={2}
                  placeholder="Descrição desta imagem"
                  className="w-full resize-none border-0 border-t border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              ) : image.description ? (
                <p className="p-2 text-xs text-muted-foreground">{image.description}</p>
              ) : null}
            </div>
          ))}
          {pending.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-md border border-border bg-card">
              <div className="relative aspect-video bg-muted">
                <img src={image.previewUrl} alt="Nova imagem" className="h-full w-full object-contain" />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7"
                  onClick={() => removePendingImage(image.id, editing)}
                  aria-label="Remover imagem"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <textarea
                value={image.description}
                onChange={(event) => updatePendingDescription(image.id, event.target.value, editing)}
                maxLength={500}
                rows={2}
                placeholder="Descrição desta imagem"
                className="w-full resize-none border-0 border-t border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="rounded-xl border border-border bg-card p-6 shadow-elevated"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <BookOpen className="h-5 w-5 text-accent-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-card-foreground">Base de Conhecimento</p>
          <p className="text-xs text-muted-foreground">
            Informações que a IA usa para responder com mais precisão
          </p>
        </div>
      </div>

      {!textOnly && (
        <div className="flex gap-1 rounded-lg bg-muted p-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Add Forms */}
      {activeTab !== 'flows' && (
        <div className="mb-4 space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">País deste conteúdo</label>
          <select
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="any">Qualquer país</option>
            <option value="MX">México</option>
            <option value="UY">Uruguai</option>
            <option value="AR">Argentina</option>
            <option value="BR">Brasil</option>
          </select>
        </div>
      )}
      <div className="mb-6 space-y-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Etiquetas desta base</label>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione uma ou várias. Sem seleção, o conteúdo será geral para qualquer cliente.
          </p>
        </div>
        {tags.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Nenhuma etiqueta cadastrada neste espaço de trabalho.
          </p>
        ) : (
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
            {tags.map((tag) => {
              const checked = selectedTagIds.includes(tag.id);
              return (
                <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">
                  <Checkbox checked={checked} onCheckedChange={() => toggleSelectedTag(tag.id)} />
                  <Tag className="h-3 w-3 text-primary" />
                  {tag.name}
                </label>
              );
            })}
          </div>
        )}
      </div>
      {activeTab === 'text' && (
        <div className="space-y-3 mb-6">
          <input
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Título (ex: Informações sobre a empresa)"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={5}
            placeholder="Cole aqui informações sobre produtos, serviços, FAQs, políticas, etc."
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {imageEditor([], pendingImages)}
          <button
            onClick={addTextItem}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adicionar Conhecimento
          </button>
        </div>
      )}

      {activeTab === 'qa' && (
        <div className="space-y-3 mb-6">
          <input
            value={qaQuestion}
            onChange={(e) => setQaQuestion(e.target.value)}
            placeholder="Pergunta (ex: Qual o horário de funcionamento?)"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={qaAnswer}
            onChange={(e) => setQaAnswer(e.target.value)}
            rows={3}
            placeholder="Resposta (ex: Funcionamos de segunda a sexta, das 9h às 18h)"
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {imageEditor([], pendingImages)}
          <button
            onClick={addQAItem}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adicionar Pergunta e Resposta
          </button>
        </div>
      )}

      {activeTab === 'file' && (
        <div className="space-y-3 mb-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background p-8 cursor-pointer hover:border-primary/50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            )}
            <p className="text-sm font-medium text-foreground">
              {uploading ? 'Enviando...' : 'Clique para enviar um arquivo'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, TXT, MD, CSV, JSON — máx 10MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {activeTab === 'flows' && nicheId && (
        <div className="space-y-3 mb-6">
          {loadingFlows ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : flows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Workflow className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum fluxo encontrado neste nicho.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Crie fluxos de automação na aba "Fluxos" primeiro.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {flows.length} fluxo(s) disponível(is) neste nicho
                </p>
                <button
                  onClick={importAllFlows}
                  disabled={importingFlowId === 'all'}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {importingFlowId === 'all' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Importar Todos
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {flows.map((flow) => {
                  const alreadyImported = isFlowAlreadyImported(flow.name);
                  return (
                    <div
                      key={flow.id}
                      className="rounded-lg border border-border bg-background p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Workflow className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">
                            {flow.name}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            flow.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-secondary text-muted-foreground'
                          }`}>
                            {flow.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-5.5">
                          {flow.nodes.length} etapa(s)
                          {flow.description && ` · ${flow.description.substring(0, 60)}`}
                        </p>
                      </div>
                      {alreadyImported ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 shrink-0">
                          <Check className="h-3.5 w-3.5" />
                          Importado
                        </span>
                      ) : (
                        <button
                          onClick={() => importFlow(flow)}
                          disabled={importingFlowId === flow.id}
                          className="shrink-0 flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
                        >
                          {importingFlowId === flow.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Importar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            {textOnly
              ? 'Nenhuma informação adicionada para este nicho e país.'
              : 'Nenhum conhecimento adicionado. Adicione textos, perguntas ou arquivos para treinar a IA.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-background p-3 group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {typeIcon(item.type)}
                  <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {typeLabel(item.type)}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {item.country_code === 'any' ? 'Qualquer país' : item.country_code}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openEditItem(item)}
                    title="Editar"
                    aria-label={`Editar ${item.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteItem(item)}
                    title="Excluir"
                    aria-label={`Excluir ${item.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 ml-5.5">
                {item.type === 'qa' ? `R: ${item.content}` : item.content.substring(0, 150)}
                {item.content.length > 150 && '...'}
              </p>
              {item.images.length > 0 && (
                <div className="mt-2 ml-5.5 flex items-center gap-1.5 text-xs text-primary">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {item.images.length} {item.images.length === 1 ? 'imagem anexada' : 'imagens anexadas'}
                </div>
              )}
              <div className="mt-3 ml-5.5">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {item.tag_ids.length > 0 ? 'Usar para clientes com' : 'Conteúdo geral — selecione etiquetas para restringir'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const checked = item.tag_ids.includes(tag.id);
                    return (
                      <label key={`${item.id}-${tag.id}`} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition-colors ${checked ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        <Checkbox checked={checked} onCheckedChange={() => toggleItemTag(item, tag.id)} />
                        {tag.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mt-4">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Dica:</strong> Adicione informações completas sobre seus produtos,
          serviços, preços e políticas. Quanto mais contexto a IA tiver, melhor serão as respostas.
        </p>
      </div>

      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && !savingEdit && setEditingItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar conhecimento</DialogTitle>
            <DialogDescription>
              Atualize as informações que a IA usa para responder aos clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {editingItem?.type === 'qa' ? 'Pergunta' : 'Título'}
              </label>
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {editingItem?.type === 'qa' ? 'Resposta' : 'Conteúdo'}
              </label>
              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                rows={8}
                className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">País deste conteúdo</label>
              <select
                value={editCountryCode}
                onChange={(event) => setEditCountryCode(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="any">Qualquer país</option>
                <option value="MX">México</option>
                <option value="UY">Uruguai</option>
                <option value="AR">Argentina</option>
                <option value="BR">Brasil</option>
              </select>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Etiquetas desta base</label>
                <p className="mt-1 text-xs text-muted-foreground">Sem seleção, o conteúdo será geral para qualquer cliente.</p>
              </div>
              {tags.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
                  {tags.map((tag) => (
                    <label key={`edit-${tag.id}`} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">
                      <Checkbox checked={editTagIds.includes(tag.id)} onCheckedChange={() => toggleEditTag(tag.id)} />
                      <Tag className="h-3 w-3 text-primary" />
                      {tag.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {imageEditor(editExistingImages, editNewImages, true)}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button type="button" disabled={savingEdit} onClick={saveEditedItem}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
