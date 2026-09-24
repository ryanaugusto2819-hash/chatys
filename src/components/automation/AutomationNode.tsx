import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  MessageSquare, Clock, Image, Music, Video, Play, Zap, FileText,
  MapPin, Hash, GitFork, MousePointer, Inbox, MessageCircle, Send,
  Bot, ListOrdered, Link2, Cog, Tag, ArrowRightLeft, Globe, Trash2, Target
} from 'lucide-react';

const nodeConfig: Record<string, { icon: React.ElementType; typeLabel: string; colors: string }> = {
  trigger: {
    icon: Zap,
    typeLabel: 'GATILHO',
    colors: 'bg-primary/10 border-primary/50 text-primary',
  },
  message: {
    icon: MessageSquare,
    typeLabel: 'MENSAGEM',
    colors: 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-500/40 dark:text-emerald-300',
  },
  delay: {
    icon: Clock,
    typeLabel: 'ESPERA',
    colors: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:border-amber-500/40 dark:text-amber-300',
  },
  wait_for_response: {
    icon: MessageCircle,
    typeLabel: 'AGUARDANDO RESPOSTA',
    colors: 'bg-primary/10 border-primary/50 text-primary',
  },
  image: {
    icon: Image,
    typeLabel: 'IMAGEM',
    colors: 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500/40 dark:text-blue-300',
  },
  audio: {
    icon: Music,
    typeLabel: 'ÁUDIO',
    colors: 'bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-900/20 dark:border-violet-500/40 dark:text-violet-300',
  },
  video: {
    icon: Video,
    typeLabel: 'VÍDEO',
    colors: 'bg-pink-50 border-pink-300 text-pink-700 dark:bg-pink-900/20 dark:border-pink-500/40 dark:text-pink-300',
  },
  document: {
    icon: FileText,
    typeLabel: 'DOCUMENTO',
    colors: 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-900/20 dark:border-orange-500/40 dark:text-orange-300',
  },
  condition: {
    icon: GitFork,
    typeLabel: 'CONDIÇÃO',
    colors: 'bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-500/40 dark:text-cyan-300',
  },
  smart_condition: {
    icon: Bot,
    typeLabel: 'CONDIÇÃO INTELIGENTE',
    colors: 'bg-cyan-50 border-cyan-300 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-500/40 dark:text-cyan-300',
  },
  quick_reply: {
    icon: ListOrdered,
    typeLabel: 'RESPOSTA RÁPIDA',
    colors: 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-500/40 dark:text-indigo-300',
  },
  ai_reply: {
    icon: Bot,
    typeLabel: 'RESPOSTA IA',
    colors: 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:border-fuchsia-500/40 dark:text-fuchsia-300',
  },
  smart_reply: {
    icon: Bot,
    typeLabel: 'RESPOSTA INTELIGENTE',
    colors: 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700 dark:bg-fuchsia-900/20 dark:border-fuchsia-500/40 dark:text-fuchsia-300',
  },
  action: {
    icon: Cog,
    typeLabel: 'AÇÃO',
    colors: 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-900/20 dark:border-rose-500/40 dark:text-rose-300',
  },
  call_button: {
    icon: MessageSquare,
    typeLabel: 'BOTÃO LIGAÇÃO',
    colors: 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/20 dark:border-teal-500/40 dark:text-teal-300',
  },
};

const triggerLabels: Record<string, string> = {
  manual: '⚡ Disparo Manual',
  message_received: '📩 Ao Receber Mensagem',
  keyword: '🔑 Palavra-chave',
  new_conversation: '🆕 Nova Conversa',
  scheduled: '⏰ Agendado',
};

function AutomationNode({ data, selected, id }: NodeProps) {
  const nodeType = (data.nodeType as string) || 'message';
  const cfg = nodeConfig[nodeType] || nodeConfig.message;
  const Icon = cfg.icon;
  const label = (data.label as string) || '';
  const preview = data.preview as string;
  const config = data.config as Record<string, unknown>;
  const onDelete = data.onDelete as ((nodeId: string) => void) | undefined;

  // For trigger nodes, show trigger types (supports multiple)
  const triggerType = config?.trigger_type as string;
  const activeTriggersList = (config?.active_triggers as string[]) || (triggerType ? [triggerType] : []);
  const triggerLabel = nodeType === 'trigger' && activeTriggersList.length > 0
    ? activeTriggersList.length === 1
      ? triggerLabels[activeTriggersList[0]]
      : null
    : null;

  return (
    <div
      className={`group rounded-2xl border-2 min-w-[220px] max-w-[280px] shadow-sm hover:shadow-md transition-all duration-200 ${cfg.colors} ${
        selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background shadow-lg scale-[1.02]' : ''
      }`}
    >
      {nodeType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-foreground/60 !w-3 !h-3 !border-2 !border-background !-top-1.5"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-current/10">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-80">
            {cfg.typeLabel}
          </span>
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded-md hover:bg-destructive/20 text-destructive/70 hover:text-destructive transition-all"
            title="Remover nó"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        <p className="text-sm font-semibold leading-tight truncate">{label}</p>

        {triggerLabel && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-current/10 px-2 py-0.5">
            <span className="text-[11px] font-medium">{triggerLabel}</span>
          </div>
        )}

        {nodeType === 'trigger' && activeTriggersList.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {activeTriggersList.map((t) => (
              <span key={t} className="inline-flex items-center rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-medium">
                {triggerLabels[t] || t}
              </span>
            ))}
          </div>
        )}

        {nodeType === 'trigger' && triggerType === 'keyword' && config?.keywords && (
          <p className="text-[11px] mt-1 opacity-60 truncate">
            Palavras: {(config.keywords as string[])?.join(', ')}
          </p>
        )}

        {/* Connection badges */}
        {nodeType === 'trigger' && ((config?.connection_ids as string[])?.length > 0) && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            <Link2 className="h-3 w-3 opacity-50" />
            {((config.connection_ids as string[]) || []).map((id, i) => (
              <span key={id} className="inline-flex items-center rounded-full bg-current/10 px-1.5 py-0.5 text-[9px] font-medium opacity-70">
                Conexão {i + 1}
              </span>
            ))}
          </div>
        )}

        {preview && !triggerLabel && (
          <p className="text-[11px] mt-1 opacity-60 truncate">{preview}</p>
        )}

        {nodeType === 'condition' && config?.condition_field && (
          <p className="text-[11px] mt-1 opacity-60 truncate">
            Se {config.condition_field as string} {config.condition_operator as string} {config.condition_value as string}
          </p>
        )}

        {nodeType === 'smart_condition' && (
          <div className="mt-2 space-y-1 text-[10px] font-medium">
            <p className="truncate"><span className="font-extrabold">X</span> · {(config?.option_x as string) || 'Defina o significado de X'}</p>
            <p className="truncate"><span className="font-extrabold">Y</span> · {(config?.option_y as string) || 'Defina o significado de Y'}</p>
          </div>
        )}
        {nodeType === 'wait_for_response' && (
          <p className="text-[11px] mt-1 opacity-70">
            Até {Number(config?.timeout_value) || 24} {(config?.timeout_unit as string) === 'minutes' ? 'min' : (config?.timeout_unit as string) === 'days' ? 'dias' : 'h'}
          </p>
        )}
        {nodeType === 'smart_reply' && (
          <p className="text-[11px] mt-1 opacity-70">Base por nicho e país · confiança mínima 75%</p>
        )}

        {nodeType === 'quick_reply' && config?.buttons && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(config.buttons as string[])?.slice(0, 3).map((b, i) => (
              <span key={i} className="rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-medium">{b}</span>
            ))}
          </div>
        )}

        {nodeType === 'call_button' && config?.call_phone && (
          <p className="text-[10px] mt-1 opacity-60 truncate">📞 {config.call_phone as string}</p>
        )}

        {/* Action node preview */}
        {nodeType === 'action' && config?.action_type && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {(config.action_type as string) === 'add_tag' && <Tag className="h-3 w-3" />}
            {(config.action_type as string) === 'remove_tag' && <Tag className="h-3 w-3" />}
            {(config.action_type as string) === 'set_funnel_stage' && <Target className="h-3 w-3" />}
            {(config.action_type as string) === 'transfer_agent' && <ArrowRightLeft className="h-3 w-3" />}
            {(config.action_type as string) === 'webhook' && <Globe className="h-3 w-3" />}
            <span className="text-[10px] font-medium opacity-70">
              {(config.action_type as string) === 'add_tag' ? `+ ${(config.tag_name as string) || 'etiqueta'}`
                : (config.action_type as string) === 'remove_tag' ? `- ${(config.tag_name as string) || 'etiqueta'}`
                : (config.action_type as string) === 'set_funnel_stage' ? `🎯 ${(config.funnel_stage_label as string) || (config.funnel_stage as string) || 'etapa'}`
                : (config.action_type as string) === 'transfer_agent' ? `→ ${(config.agent_name as string) || 'agente'}`
                : (config.webhook_url as string)?.slice(0, 25) || 'webhook'}
            </span>
          </div>
        )}
      </div>

      {nodeType === 'smart_condition' ? (
        <>
          <span className="absolute bottom-1 left-[28%] -translate-x-1/2 text-[9px] font-extrabold">X</span>
          <Handle id="x" type="source" position={Position.Bottom} style={{ left: '28%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
          <span className="absolute bottom-1 left-[72%] -translate-x-1/2 text-[9px] font-extrabold">Y</span>
          <Handle id="y" type="source" position={Position.Bottom} style={{ left: '72%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
        </>
      ) : nodeType === 'wait_for_response' ? (
        <>
          <span className="absolute bottom-1 left-[28%] -translate-x-1/2 text-[9px] font-extrabold">RESPONDEU</span>
          <Handle id="response" type="source" position={Position.Bottom} style={{ left: '28%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
          <span className="absolute bottom-1 left-[72%] -translate-x-1/2 text-[9px] font-extrabold">TEMPO</span>
          <Handle id="timeout" type="source" position={Position.Bottom} style={{ left: '72%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
        </>
      ) : nodeType === 'smart_reply' ? (
        <>
          <span className="absolute bottom-1 left-[18%] -translate-x-1/2 text-[8px] font-extrabold">RESPONDEU</span>
          <Handle id="answered" type="source" position={Position.Bottom} style={{ left: '18%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-extrabold">SEM RESPOSTA</span>
          <Handle id="no_answer" type="source" position={Position.Bottom} style={{ left: '50%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
          <span className="absolute bottom-1 left-[82%] -translate-x-1/2 text-[8px] font-extrabold">ERRO</span>
          <Handle id="error" type="source" position={Position.Bottom} style={{ left: '82%' }} className="!bg-primary !w-3 !h-3 !border-2 !border-background !-bottom-1.5" />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-foreground/60 !w-3 !h-3 !border-2 !border-background !-bottom-1.5"
        />
      )}
    </div>
  );
}

export default memo(AutomationNode);
