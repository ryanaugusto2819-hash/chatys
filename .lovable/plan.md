# Filtros e histórico da Automação Inteligente

## Objetivo
Separar o painel em três visualizações simples para acompanhar treinamento, respostas ativas e decisões da IA.

## Implementação
- Adicionar filtros no topo: **Aguardando treinamento**, **Respostas ativas** e **Histórico**.
- Em **Aguardando treinamento**, mostrar somente mensagens novas, sem correspondência ou ainda pendentes de ensino.
- Em **Respostas ativas**, mostrar as regras aprendidas com edição, ativação/desativação e exclusão já existentes.
- Em **Histórico**, listar cada análise processada com cliente, mensagem, data, resposta escolhida, confiança, motivo e resultado.
- Identificar claramente o resultado como **Teste — não enviado**, **Enviado**, **Sem resposta segura**, **Ignorado** ou **Não responder**.
- Como a IA continua em modo seguro, registros atuais aparecerão como teste e nunca serão apresentados falsamente como mensagens enviadas.

## Validação
- Confirmar que os três filtros alternam sem misturar conteúdos.
- Confirmar que respostas continuam editáveis.
- Confirmar que o histórico mostra decisões existentes e seus estados reais.
- Validar a página em desktop e celular e verificar ausência de erros.
