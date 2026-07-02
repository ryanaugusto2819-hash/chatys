## Objetivo

Adicionar um bloco **"Atalhos de Automação"** no painel lateral direito da conversa (no espaço vazio deixado após remover as seções antigas). Cada atalho é um fluxo pré-fixado — 1 clique dispara o fluxo para o contato aberto. Os atalhos são agrupados em 3 abas de nicho: **Adulto Uruguay**, **Emagrecimento Brasil**, **Próstata Uruguay**.

Fixar/desafixar é feito via botão 📌 direto nos fluxos, dentro da própria aba de Automação.

## O que vai ser feito

**1. Banco de dados (migration)**
- Adicionar coluna `is_pinned_sidebar boolean DEFAULT false` em `automation_flows`.
- Não altera RLS existente (já cobre por workspace).

**2. Página de Automação (`src/pages/Automation.tsx`)**
- Adicionar botão 📌 (ícone `Pin` / `PinOff`) em cada card de fluxo.
- Clicar alterna `is_pinned_sidebar` no banco.
- Estado visual: pino roxo quando fixado, cinza quando não.
- Só permite fixar fluxos que já têm `niche_id` (mostra tooltip explicando se não tiver).

**3. Novo componente `src/components/chat/PinnedFlowShortcuts.tsx`**
- Busca `automation_flows` onde `is_pinned_sidebar = true`, com `niche_id` e nome do nicho (JOIN em `niches`).
- Agrupa por nicho. Renderiza abas horizontais (uma por nicho que tenha fluxos fixados).
- Dentro de cada aba: grid compacto de botões "chip", cada um com nome do fluxo + ícone `GitBranch`.
- Clique = dispara `execute-flow` (mesma edge function já usada pelo `FlowTrigger`) com `conversationId` + `senderLabel: "humano"`.
- Estado de loading no chip clicado, toast de sucesso/erro.
- Se não houver fluxos fixados: mensagem discreta "Fixe fluxos em Automação para vê-los aqui".

**4. Integração no `src/pages/ChatView.tsx`**
- Renderizar `<PinnedFlowShortcuts conversationId={id} />` no painel lateral direito, logo abaixo do bloco "Informações"/Anúncio e acima de "Etiquetas".

## Categorias iniciais

Os 3 nichos citados (Adulto UY, Emagrecimento BR, Próstata UY) já existem em `niches`. As abas são **dinâmicas** — aparecem automaticamente conforme houver fluxos fixados naquele nicho. Não precisa hard-code.

## Fora do escopo (por enquanto)

- Fixar **mensagens rápidas** (o item foi mencionado no pedido mas as respostas priorizaram só fluxos com o botão 📌). Se quiser mensagens rápidas fixas também, posso adicionar o mesmo padrão em `quick_messages` num segundo passo.
- Reordenação drag-and-drop dos atalhos.

## Detalhes técnicos

- Migration: `ALTER TABLE public.automation_flows ADD COLUMN is_pinned_sidebar boolean NOT NULL DEFAULT false;`
- Query no componente: `select id, name, niche_id, niches(name, color)` filtrado por workspace atual + `is_pinned_sidebar = true` + `is_active = true`.
- Reutiliza `useWorkspace()` para escopar por workspace.
- UI: chips com `bg-secondary hover:bg-primary/10`, badge colorido do nicho, spinner `Loader2` durante execução.
