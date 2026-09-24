# Diagnóstico e correção completa do salvamento de automações

## Objetivo
Substituir os avisos genéricos por uma verificação completa que mostre todos os problemas do fluxo, indique exatamente qual bloco está afetado e permita corrigir automaticamente os casos seguros sem recarregar a página.

## O que será feito
- Validar todo o fluxo de uma vez, em vez de parar no primeiro erro.
- Exibir um painel de problemas com nome e tipo do bloco, problema encontrado e instrução objetiva para corrigir.
- Ao clicar em um problema, abrir o bloco correspondente para edição.
- Adicionar “Corrigir automaticamente” para ajustes seguros: prazos padrão ausentes, identificadores antigos das conexões e configurações padrão compatíveis.
- Preservar o trabalho atual no canvas e nunca recarregar a página.
- Mostrar erros reais de gravação em linguagem clara, incluindo em qual etapa ocorreu e uma orientação para tentar novamente.
- Impedir salvamento parcial: preparar e validar tudo antes de substituir os dados existentes; usar uma operação única no banco para gravar fluxo, blocos e conexões juntos.
- Manter o botão Salvar disponível após a correção e informar quantos problemas ainda dependem de ação manual.

## Validações incluídas
- Condição Inteligente: textos e todas as saídas ativas.
- Aguardando Resposta: prazo e saídas Respondeu/Tempo esgotado.
- Resposta Inteligente e Reconhecer Comprovante: todas as saídas e conteúdo obrigatório.
- Ações: fluxo, atendente, etiqueta, etapa ou endereço obrigatório conforme a ação escolhida.
- Estrutura: conexões inválidas, duplicadas, apontando para blocos removidos e blocos sem identificação válida.

## Verificação
- Testar fluxos válidos e fluxos com vários erros simultâneos.
- Confirmar correção automática de conexões antigas sem recarregar.
- Confirmar que uma falha de gravação não apaga o fluxo salvo anteriormente.
- Validar o comportamento no fluxo atualmente aberto usando uma sessão separada.
