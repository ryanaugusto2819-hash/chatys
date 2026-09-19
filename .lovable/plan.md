# Aumentar a precisão da IA Seletora de Fluxo

## O que será feito

- Ampliar cada fluxo anexado com quatro configurações:
  - quando deve ser enviado;
  - quando não deve ser enviado;
  - exemplos reais de mensagens que devem acioná-lo;
  - opção para a IA analisar o conteúdo completo do fluxo.
- Organizar esses campos dentro de cada fluxo selecionado, mantendo a busca existente.
- Salvar as novas regras de forma independente para cada fluxo.
- Exigir regras positivas, negativas e exemplos antes de permitir salvar um fluxo anexado.

## Precisão e segurança

- A Seletora receberá as regras positivas e negativas, exemplos e, quando autorizado, o conteúdo dos blocos do fluxo.
- Fluxos pausados, manuais ou já executados não serão recomendados automaticamente.
- Em caso de conflito entre exemplos e regras negativas, a regra “quando não enviar” terá prioridade.
- Em caso de dúvida, a Seletora não escolherá nenhum fluxo.
- Tudo continuará no modo de teste seguro, sem envio automático.

## Validação

- Confirmar que os novos campos permanecem salvos após recarregar a página.
- Confirmar que ativar/desativar a leitura do conteúdo do fluxo permanece salvo.
- Testar uma decisão com fluxo permitido e outra bloqueada por uma regra negativa.
- Validar a tela e a função de decisão sem erros.
