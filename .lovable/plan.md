# Integração nativa Chatys ↔ Liberty POS

Vamos ligar este sistema direto ao **Supabase** do outro projeto (`libertypos.lovable.app`) — sem webhooks. Toda leitura, criação, edição e exclusão de pedidos passa por Edge Functions daqui que falam diretamente com o banco de lá usando a **Service Role Key**. É o modo mais "nativo" possível entre dois projetos Lovable Cloud distintos.

## Como vai funcionar

```text
ChatView (aqui)
   └─ <PedidosClienteSidebar telefone="55349..." />
         │  React Query + realtime
         ▼
   Edge Functions (aqui)  ── HTTPS ──▶  Supabase do Liberty POS
   • pedidos-list                        (tabela public.pedidos)
   • pedidos-upsert
   • pedidos-delete
```

- Match do lead → pedido: pelo **telefone do contato** (normalizado, só dígitos).
- Um contato pode ter **N pedidos** — lista todos, mais recente primeiro.
- Alterações feitas aqui gravam no banco de lá na hora; um `select` de refresh atualiza a UI (opcionalmente com Realtime).

## O que aparece na sidebar do chat

Card por pedido (colapsável), com edição inline dos campos que a foto mostra:

- **Somente leitura:** Cliente, Entrada, Cédula, Telefone, Produto, Valor, Qtd
- **Editáveis (dropdowns / inputs):**
  - Entrega (data)
  - Frete, Notas
  - Rastreamento (código + status)
  - Pagamento (Pendente / Pago / Estornado)
  - Forma Pgto (Pix / Cartão / Boleto / …)
  - Logística (Correios / Transportadora / …)
  - Cód. Conta
  - Envio (Não enviado / Enviado / Entregue)
  - Status Cobrança (Pendente / Em atraso / Quitado / Cancelado)
  - Comprovante (upload → storage do outro projeto)
  - Etiqueta de Envio (upload)
  - WPP Cobrança (status)
- **Ações:** Novo pedido, Excluir pedido (com confirmação).

Todos os selects usam os mesmos valores que já existem no Liberty POS (vou puxar da tabela `pedidos` de lá; se houver enums, respeito).

## O que preciso de você (uma vez)

1. **Confirmar o projeto de origem.** `libertypos.lovable.app` não está listado no meu workspace com esse nome — o mais próximo é [Liberty Marketing Hub](/projects/15eda5fc-0aa0-4802-8dcf-1bb604e2948c), mas ele não tem backend. Preciso que você:
   - Confirme o nome exato do projeto Lovable onde ficam os pedidos, **ou**
   - Vá em **Cloud → Advanced settings** desse projeto e me passe **Project URL** (`https://xxx.supabase.co`) e **Service Role Key**.
2. Confirmar o **nome exato da tabela** dos pedidos (assumo `pedidos`) e da coluna do telefone do cliente.

Assim que eu tiver isso, salvo como segredos aqui (`LIBERTYPOS_URL`, `LIBERTYPOS_SERVICE_ROLE_KEY`) e sigo.

## Passos de implementação

1. **Segredos:** `add_secret` para `LIBERTYPOS_URL` e `LIBERTYPOS_SERVICE_ROLE_KEY`.
2. **Edge Functions (deste projeto):**
   - `libertypos-pedidos-list` — GET por telefone, retorna array de pedidos.
   - `libertypos-pedidos-upsert` — POST cria ou atualiza um pedido.
   - `libertypos-pedidos-delete` — DELETE por id.
   - `libertypos-pedidos-upload` — POST recebe arquivo (comprovante/etiqueta), envia para o Storage do outro projeto, devolve URL assinada.
   - Todas usam `createClient(LIBERTYPOS_URL, LIBERTYPOS_SERVICE_ROLE_KEY)` e validam JWT do usuário logado aqui antes de rodar.
3. **Hook `useLibertyPedidos(telefone)`** — React Query, invalida no upsert/delete. Opcional: canal realtime dedicado abrindo `createClient` no browser com a **anon key** do outro projeto para atualizar automático quando alguém editar por lá.
4. **Componente `<LibertyPedidosPanel />`** na sidebar direita do `ChatView.tsx`, acima ou abaixo dos "Atalhos de Automação", só aparece se houver telefone válido.
5. **UI:** card por pedido com badges de status coloridos (mesma paleta roxa da plataforma), edição inline com auto-save (debounce 500ms) e toast de confirmação/erro.

## Detalhes técnicos

- **Sem webhooks, sem sync assíncrono:** cada ação = chamada HTTPS síncrona ao Supabase do outro projeto. Latência esperada 100–300ms.
- **Segurança:** Service Role Key **fica só nas Edge Functions** daqui (nunca no bundle do browser). O anon key do outro projeto pode ir no client apenas para realtime read-only.
- **Storage:** uploads de comprovante/etiqueta vão para o bucket do outro projeto (você me diz o nome; assumo `pedidos-anexos`).
- **Realtime (opcional nesta fase 1):** posso adicionar depois; a v1 já fica fluida com invalidate do React Query após cada save.
- **Sem alterações de schema aqui.** Este projeto não ganha tabela nova — só consome/edita o banco de lá.

## Fora do escopo desta plano

- Criar tabela espelho local dos pedidos (você pediu explicitamente "nativo", então evito duplicar dados).
- Sync de leads/contatos do sentido oposto (Chatys → Liberty POS). Se precisar, é um plano à parte.
