# Acompanhamento visual do lead no fluxo

## Objetivo
Permitir buscar um lead pelo número de telefone dentro do editor da automação e visualizar, no próprio desenho do fluxo, onde ele está e por quais blocos passou.

## O que será feito
- Adicionar o botão **Acompanhar lead** no editor do fluxo, com busca por número de telefone.
- Localizar somente execuções desse fluxo e do espaço de trabalho atual, aceitando telefone com ou sem símbolos.
- Usar a execução mais recente encontrada e mostrar nome, telefone, estado e horário de início.
- Destacar no desenho:
  - blocos já percorridos;
  - conexões efetivamente usadas;
  - bloco atual quando estiver aguardando, executando ou com falha;
  - fluxo concluído quando não houver bloco atual.
- Exibir uma legenda visual e permitir limpar o acompanhamento para voltar ao modo normal de edição.
- Ao existir mais de uma execução do mesmo lead, permitir trocar entre as execuções recentes.

## Detalhes técnicos
- Reutilizar `flow_executions`, `flow_step_logs` e `conversations`; nenhuma tabela nova é necessária.
- Derivar o caminho pelas etapas registradas em ordem e pelas conexões entre os blocos consecutivos.
- Manter a edição e o salvamento do fluxo independentes do modo de acompanhamento.
- Não recarregar a página nem alterar a execução real do lead.

## Validação
- Testar telefone com e sem formatação.
- Confirmar destaque de caminho concluído, espera atual e falha.
- Confirmar troca entre execuções e limpeza do filtro.
- Verificar que editar e salvar o fluxo continuam funcionando normalmente.
