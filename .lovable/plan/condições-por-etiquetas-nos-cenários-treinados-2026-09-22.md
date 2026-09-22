# Condições por etiquetas nos cenários treinados

## Objetivo
Adicionar um bloco de condições em cada cenário para que a IA escolha ações e mensagens diferentes conforme as etiquetas atuais do cliente.

## Alterações
- Adicionar em cada cenário duas condições opcionais:
  - **Deve ter estas etiquetas**: todas as etiquetas selecionadas precisam estar no cliente.
  - **Não pode ter estas etiquetas**: se qualquer uma estiver no cliente, o cenário é bloqueado.
- Mostrar as etiquetas existentes do workspace como seletores, evitando digitação e diferenças de escrita.
- No treinamento de uma nova mensagem, preencher inicialmente as etiquetas que o cliente possui naquele momento, permitindo ajustar antes de salvar.
- Exibir e editar as condições em cada cenário aprendido.
- Antes de comparar significado, filtrar as regras pelas etiquetas atuais; a IA nunca poderá selecionar uma regra cuja condição não seja atendida.
- Permitir vários cenários com a mesma pergunta e respostas diferentes para combinações distintas de etiquetas.
- Manter o modo de teste: apenas mostrar qual ação e mensagem seriam escolhidas.

## Exemplo
- Mensagem: cliente pergunta o valor.
- Cenário A: deve ter etiqueta **X** → usar resposta **Y**.
- Cenário B: deve ter etiqueta **Y** → usar resposta **Z**.
- Sem condição compatível → não escolher resposta e manter para revisão.

## Validação
- Salvar e recarregar condições de etiquetas.
- Confirmar que uma regra compatível fica disponível e uma regra incompatível é bloqueada.
- Confirmar que cenários sem condições continuam funcionando para qualquer cliente.
- Validar tela, função publicada e compilação.
