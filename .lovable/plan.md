# Ações com mensagens e fluxos na Automação Inteligente

## O que será adicionado

Em cada cenário e para cada etiqueta de contexto, o treinamento poderá escolher uma destas ações:

1. **Responder com mensagem** — envia exatamente o texto cadastrado.
2. **Enviar fluxo** — seleciona e executa um fluxo existente, sem mensagem anterior.
3. **Responder e depois enviar fluxo** — envia exatamente a mensagem cadastrada e, após a confirmação do envio, inicia o fluxo escolhido.

## Painel

- Substituir os campos fixos por um seletor claro de ação.
- Mostrar o campo de mensagem somente quando a ação usar mensagem.
- Mostrar a lista de fluxos somente quando a ação usar fluxo.
- Identificar fluxos pausados ou somente manuais e impedir sua seleção para execução automática.
- Permitir editar ação, mensagem e fluxo nas respostas já aprendidas.
- Exibir no histórico a mensagem e o fluxo escolhidos.

## Segurança e execução

- Salvar o fluxo escolhido junto ao cenário treinado, validando que pertence ao mesmo espaço de trabalho.
- Manter o modo de teste atual: registrar a decisão sem enviar mensagem nem executar fluxo.
- Quando o modo ao vivo for habilitado futuramente, garantir ordem única: mensagem confirmada primeiro, fluxo depois.
- Nunca executar duas ações concorrentes para a mesma mensagem recebida.
- Preservar exatamente a mensagem oficial, sem reescrita pela IA.

## Validação

- Testar as três ações nas quatro etiquetas de contexto.
- Confirmar persistência após recarregar e edição das respostas ativas.
- Confirmar histórico com mensagem, fluxo e indicação de teste não enviado.
- Validar banco, função da IA, tela e funcionamento em celular e computador.
