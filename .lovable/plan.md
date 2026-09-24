# Auditoria e histórico das automações

## Objetivo
Transformar a tela atual de métricas de cada fluxo em uma central de análise, mostrando se o fluxo está funcionando, onde falhou, o histórico completo e quais dúvidas a Resposta Inteligente não encontrou na Base de Conhecimento.

## Implementação
- Renomear a entrada de métricas para **Analisar fluxo** e manter o acesso em cada fluxo e no editor.
- Organizar a análise em quatro abas:
  - **Visão geral**: execuções, taxa de sucesso, falhas, esperas e desempenho por bloco.
  - **Problemas**: blocos com falhas, mensagem real do erro, quantidade de ocorrências, última ocorrência e orientação prática para corrigir.
  - **Histórico**: execuções recentes com cliente, horário, estado, progresso e detalhes de cada bloco executado.
  - **Dúvidas sem resposta**: perguntas que chegaram ao bloco Resposta Inteligente e terminaram sem resposta segura ou com conteúdo ausente.
- Permitir pesquisar e filtrar o histórico por estado e período, sem misturar dados de outros fluxos ou espaços de trabalho.
- Em cada dúvida sem resposta, mostrar pergunta, contexto disponível, país, confiança, motivo e data; incluir ação para abrir a Base de Conhecimento já no nicho relacionado.
- Evitar duplicidade visual agrupando perguntas repetidas, exibindo quantidade e ocorrência mais recente.
- Usar os registros já produzidos pelas execuções e pela Resposta Inteligente; não alterar o comportamento nem interromper os fluxos.

## Detalhes técnicos
- Reaproveitar `flow_executions`, `flow_step_logs` e `ai_smart_reply_logs`, com consultas paginadas e limitadas ao fluxo atual.
- Considerar como dúvida pendente resultados sem resposta, baixa confiança, ausência de fonte compatível ou falha de configuração da fonte.
- Relacionar execuções às conversas para identificar o cliente sem expor informações de outro workspace.
- Preservar a aparência atual e os tokens visuais do projeto, com estados claros para sucesso, atenção, espera e falha.

## Validação
- Confirmar filtros, paginação e abertura dos detalhes de uma execução.
- Confirmar que falhas apontam o bloco correto e exibem o erro registrado.
- Confirmar que dúvidas sem resposta correspondem aos registros reais e abrem a Base de Conhecimento no nicho correto.
- Validar em desktop e celular, sem recarregar ou alterar o fluxo aberto do usuário.
