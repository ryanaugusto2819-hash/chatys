# Filtro de país na Automação Inteligente

## Identificação
- Identificar automaticamente o país pelo DDI do telefone do cliente.
- Países iniciais: **México (+52)**, **Uruguai (+598)** e **Argentina (+54)**.
- Registrar o país identificado no contexto e no histórico da análise.

## Treinamento
- Adicionar um seletor de país para cada contexto: Sem etiqueta, Etapa 1, Etapa 2, Pago e Pós-venda.
- Permitir ensinar ações, mensagens e fluxos diferentes para a mesma dúvida conforme o país.
- Incluir a opção **Qualquer país** para uma regra geral, usada quando não houver uma regra específica equivalente.
- Mostrar o país em cada resposta ativa e permitir alterá-lo.

## Decisão segura
- Primeiro considerar regras específicas do país identificado.
- Usar regras de **Qualquer país** somente como alternativa.
- Nunca usar uma regra de outro país.
- Continuar respeitando as condições de etiqueta e o modo de teste, sem envios reais.

## Validação
- Confirmar a identificação dos três DDIs.
- Testar cadastro, edição, persistência e exibição no histórico.
- Validar que uma regra do México não seja usada para Uruguai ou Argentina.
