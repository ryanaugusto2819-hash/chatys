# Automação Inteligente por mensagens treinadas

## Objetivo
Criar uma nova IA na Central que analisa mensagens novas e o contexto da conversa, mas nunca inventa uma resposta. Ela escolhe somente uma resposta oficial cadastrada e, inicialmente, apenas mostra o que faria no modo de teste.

## Nova IA na Central
- Adicionar **IA de Mensagens Treinadas** como função independente, com ativação por conexão e instruções próprias.
- Manter o modo inicial fixado em **Teste — não envia nada**.
- Exibir indicadores de mensagens aguardando treinamento, respostas aprendidas e decisões recentes.

## Fila de treinamento
- Registrar somente mensagens novas recebidas depois da ativação, com proteção contra duplicidade entre os provedores de WhatsApp.
- Mostrar a mensagem do cliente junto do contexto recente da conversa, contato, conexão, etapa e etiquetas.
- Para cada item, permitir:
  - cadastrar a resposta oficial exata;
  - marcar que não deve haver resposta;
  - ignorar mensagens sem utilidade para treinamento.
- Permitir revisar, editar, desativar e excluir uma regra aprendida sem apagar a mensagem original da conversa.

## Aprendizado e seleção
- Salvar a mensagem de exemplo, o contexto relevante e a resposta oficial como uma regra de treinamento protegida pelo workspace.
- Comparar novas dúvidas por intenção e significado, reconhecendo perguntas semelhantes escritas com outras palavras e equivalências entre português e espanhol mexicano.
- Considerar o histórico recente antes de escolher, evitando respostas inadequadas à etapa atual.
- Exigir correspondência segura; em dúvida, não selecionar nenhuma resposta.
- Quando houver correspondência, devolver o texto oficial **exatamente como cadastrado**, sem tradução, adaptação ou alteração de palavras.

## Modo de teste e segurança
- Para cada nova mensagem, registrar qual resposta seria escolhida, confiança, regra utilizada e motivo da rejeição quando nenhuma for adequada.
- Não enviar mensagens, executar fluxos ou alterar etiquetas nesta etapa.
- Não permitir que esta IA e outro Atendente respondam à mesma mensagem; a futura ativação ao vivo continuará subordinada à Orquestradora.
- Respeitar conexões permitidas, venda registrada, etapa do funil e bloqueios globais existentes.

## Estrutura técnica
- Criar armazenamento protegido para fila de treinamento, regras aprendidas e resultados de teste, com acesso administrativo por workspace.
- Criar uma função serverless para receber mensagens novas de forma idempotente e outra para realizar a correspondência semântica usando `openai/gpt-6-astra`.
- Integrar os quatro recebimentos atuais de WhatsApp ao mesmo ponto de captura, sem duplicar chamadas de IA.
- Registrar consumo de IA e retornar erros detalhados, sem respostas genéricas.

## Validação
- Ativar a nova IA em uma conexão e confirmar que apenas mensagens posteriores aparecem na fila.
- Cadastrar uma resposta e testar frases diferentes com o mesmo significado em espanhol mexicano.
- Confirmar que a resposta sugerida é idêntica ao texto oficial salvo.
- Confirmar que mensagens ambíguas ficam sem resposta e que nada é enviado ao cliente.
- Confirmar persistência após recarregar, isolamento entre workspaces e ausência de duplicidades.
