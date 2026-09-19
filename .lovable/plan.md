# Automatizar voucher OXXO e etiquetas

## Resultado
- Ao gerar um voucher na conversa, enviar automaticamente ao cliente a imagem do código de barras, a referência digitável e a mensagem em espanhol informada.
- Aplicar a etiqueta `OXXO` após o envio completo.
- Quando a XPag confirmar o pagamento, remover a associação `OXXO` e aplicar `PAGO`.
- Manter o botão do voucher como opção de reenvio em caso de necessidade.

## Implementação
- Ajustar o painel OXXO para disparar o envio assim que a geração retornar os dados do voucher.
- Simplificar o conteúdo enviado, removendo valor e instruções extras.
- Criar ou reutilizar as etiquetas por workspace, sem excluir etiquetas permanentemente.
- Tornar a atualização para `PAGO` idempotente no webhook de confirmação.
- Validar o frontend e as funções afetadas.
