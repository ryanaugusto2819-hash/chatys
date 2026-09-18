# Colar e enviar imagens no chat

## Alteração
- Detectar imagens copiadas quando o usuário pressionar **Ctrl+V** no campo de mensagem.
- Validar formato e limite atual de 16 MB, mostrando um aviso claro se o conteúdo não for aceito.
- Exibir a imagem colada na mesma prévia já usada pelos anexos, permitindo remover ou escrever uma legenda.
- Manter o envio pelo botão ou pela tecla Enter, usando exatamente o fluxo atual de upload e envio de mídia.
- Substituir corretamente uma imagem já selecionada, liberando a prévia anterior para não acumular memória.

## Validação
- Conferir colagem de captura de tela, prévia, remoção, legenda e envio.
- Confirmar que colar texto continua funcionando normalmente.
- Verificar a tela em computador e celular e confirmar que não há erros de compilação ou execução.

## Detalhes técnicos
- A implementação ficará restrita à tela da conversa e reutilizará o armazenamento privado e as URLs assinadas já existentes.
- Nenhuma regra de envio, integração WhatsApp ou estrutura de dados será alterada.
