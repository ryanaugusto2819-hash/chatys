# Treinamento por cenário da IA de Mensagens Treinadas

## Objetivo
Transformar cada nova mensagem recebida em um cenário de treinamento. A Central mostrará a mensagem e o contexto recente, perguntará **“O que eu deveria fazer neste cenário?”** e permitirá cadastrar separadamente a ação esperada e a mensagem exata que poderá ser usada.

## O que será alterado
- Adicionar em cada item da fila dois campos distintos:
  - **Ação correta neste cenário**: instrução operacional em texto livre, como “enviar informações de entrega”, “não responder”, “encaminhar para pagamento” ou “aguardar atendente”.
  - **Mensagem pronta**: texto literal que deverá ser selecionado quando a ação exigir resposta ao cliente.
- Exibir o contexto da conversa junto à mensagem atual para o treinamento considerar histórico, etapa e etiquetas.
- Permitir salvar cenários sem mensagem quando a ação for não responder, aguardar ou apenas encaminhar.
- Guardar ação, contexto e mensagem em uma regra treinada; manter edição, ativação, desativação e exclusão.
- Atualizar a análise para comparar novas mensagens por intenção e contexto, selecionar uma regra segura e retornar tanto a ação treinada quanto a mensagem literal.
- Manter o sistema em **modo de teste**: registrar o que faria, sem enviar mensagens nem executar ações.

## Inteligência e segurança
- Analisar todas as novas mensagens das conexões anexadas à IA.
- Reconhecer cenários equivalentes mesmo com frases diferentes ou em espanhol mexicano.
- Não combinar regras, inventar ações ou reescrever a mensagem oficial.
- Exigir correspondência segura; em dúvida, manter a mensagem na fila para novo treinamento.
- Nunca permitir que esta IA execute junto com outra IA na mesma mensagem quando o modo ao vivo for liberado futuramente.

## Dados e interface
- Ampliar as regras aprendidas com a ação esperada e o tipo de ação.
- Ampliar a fila com a ação sugerida no teste.
- Na lista de regras, mostrar e permitir editar: cenário, contexto, ação correta e mensagem oficial.
- Preservar as políticas de acesso por workspace e os registros originais das conversas.

## Validação
- Confirmar que uma mensagem nova aparece uma única vez na fila.
- Ensinar um cenário com ação e mensagem; recarregar e confirmar persistência.
- Ensinar um cenário sem resposta e confirmar que não exige mensagem pronta.
- Testar uma frase semelhante e confirmar que a ação e a mensagem literal corretas são sugeridas sem envio.
- Validar a Central em desktop, os tipos, a função publicada e o estado do build.
