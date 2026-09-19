# Base de conhecimento da IA de Atendimento

## Objetivo
Adicionar uma área simples para cadastrar perguntas frequentes e respostas oficiais dentro da IA de Atendimento.

## O que será feito
- Criar armazenamento protegido por workspace para perguntas e respostas, vinculado exclusivamente à configuração da IA de Atendimento.
- Adicionar na Central de IAs uma lista editável de perguntas frequentes, com ações para adicionar, editar e excluir cada item.
- Permitir escrever o conteúdo em português; a IA poderá relacioná-lo a mensagens em espanhol mexicano pelo significado.
- Exigir pergunta e resposta preenchidas antes de salvar e manter os registros vinculados às conexões já escolhidas para essa IA.
- Incluir a base da IA de Atendimento no contexto seguro da Orquestradora, para ela distinguir uma dúvida coberta pela base de uma situação que deve ficar sem ação.
- Atualizar o roteiro interno da Central de IAs.

## Segurança e comportamento
- Somente administradores do workspace poderão criar, alterar ou excluir respostas; membros autorizados poderão consultá-las.
- A base servirá apenas como fonte oficial da IA de Atendimento; ela não altera etiquetas, confirma pagamentos ou executa fluxos.
- A Orquestradora continuará escolhendo no máximo uma IA e o modo atual continuará apenas como teste, sem envio ao cliente.

## Validação
- Confirmar criação, edição, exclusão e persistência após recarregar a página.
- Confirmar que a Orquestradora recebe apenas a base pertencente ao workspace e à IA de Atendimento correta.
- Validar tipos, função publicada, tela autenticada e estado atual do aplicativo.
