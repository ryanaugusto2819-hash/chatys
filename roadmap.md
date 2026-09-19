# Implementação uazapiGO

- [x] Criar envio dedicado de texto e mídia
- [x] Criar webhook de mensagens e atualizações de status
- [x] Criar gerenciamento de status, webhook e QR Code
- [x] Adicionar uazapiGO à criação de conexão e envio manual
- [x] Integrar cartão da conexão e QR Code
- [x] Integrar status periódico
- [x] Integrar automações, IA, follow-ups e termos
- [x] Confirmar visualmente a opção na tela autenticada
- [ ] Confirmar envio real pela uazapiGO após resolver o JID completo da conversa
- [ ] Confirmar carregamento real de novas imagens recebidas pela uazapiGO
- [x] Permitir colar capturas com Ctrl+V no campo da conversa e enviá-las como imagem

# Integração OXXO / XPag

- [x] Criar armazenamento seguro das cobranças OXXO
- [x] Criar geração de voucher pela XPag
- [x] Criar webhook de confirmação idempotente
- [x] Adicionar geração e histórico dentro da conversa
- [x] Configurar credenciais XPag com segurança
- [ ] Validar um voucher real e a confirmação após pagamento em loja
- [x] Adicionar envio do código de barras e referência OXXO ao lead
- [x] Enviar voucher automaticamente após gerar e aplicar a etiqueta OXXO
- [x] Trocar a etiqueta OXXO por PAGO após confirmação da XPag

# Webhook DataCrazy

- [x] Criar e publicar webhook público de diagnóstico
- [x] Validar recebimento e registro do JSON completo
- [x] Mapear o payload real enviado pelo DataCrazy (`amount` e `phone`)
- [x] Localizar a conversa mais recente pelo telefone
- [x] Gerar voucher OXXO e retornar URL do código de barras e referência
- [ ] Validar uma geração real iniciada pelo DataCrazy
