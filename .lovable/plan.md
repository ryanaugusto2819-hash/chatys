# Inteligência e auditoria da Automação Inteligente

## Objetivo
Melhorar o treinamento, a revisão e a confiabilidade das decisões sem ativar envios reais.

## Implementação
- Salvar, em cada decisão, uma cópia imutável da regra usada: exemplo, instrução, observação, ação, mensagens, fluxo, país e condições de etiqueta.
- Fazer o histórico ler essa cópia, mantendo a decisão original mesmo depois que a regra for editada ou excluída.
- Agrupar pendências com mensagens semelhantes e permitir ensinar o grupo de uma vez, mantendo cada lead e conversa identificáveis.
- Adicionar **Decisão correta** e **Decisão errada** no histórico, com estado persistente e possibilidade de corrigir a avaliação.
- Detectar possíveis conflitos entre regras que atendem ao mesmo país/etiqueta e possuem exemplos semelhantes; destacar as regras envolvidas em **Respostas ativas**.
- Adicionar busca no histórico por nome, telefone, mensagem recebida, etiqueta, ação, mensagem selecionada ou fluxo.
- Manter **Abrir conversa** e todos os filtros por país existentes.

## Segurança e comportamento
- A avaliação humana não altera automaticamente respostas ou etiquetas.
- O agrupamento apenas facilita o treinamento; não mistura históricos nem executa ações.
- Conflitos são alertas para revisão, não desativam regras automaticamente.
- O modo de teste continua ativo e nenhuma mensagem será enviada por esta alteração.

## Validação
- Confirmar que o histórico continua mostrando a base antiga após editar uma regra.
- Confirmar agrupamento e treinamento de mensagens semelhantes.
- Confirmar persistência das avaliações correta/errada.
- Confirmar alertas de conflito e busca por todos os campos.
- Validar página e ausência de erros.
