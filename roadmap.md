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

# Atalhos de automação na conversa

- [x] Permitir buscar, anexar e remover fluxos diretamente no bloco de atalhos

# Tradução do campo de mensagem

- [x] Alterar o destino do botão para espanhol do México
- [x] Preservar conteúdo, intenção, tom e formatação sem acréscimos ou cortes

# Menu lateral

- [x] Ocultar temporariamente o DashVendas sem remover sua página ou seus dados

# Central Inteligente de IAs

- [x] Criar a central unificada com os sete Atendentes de IA
- [x] Implementar a IA Orquestradora como única porta de decisão em modo de teste
- [x] Garantir exclusão mútua, prioridade e bloqueio pós-venda na decisão central
- [x] Registrar decisões, motivos, confiança e consumo de IA
- [ ] Integrar gradualmente Seletora, Atendimento, Pós-venda, Upsell e Remarketing
- [ ] Ampliar a IA Supervisora para avaliar todos os Atendentes de IA
- [x] Validar que o modo de teste não executa nenhuma ação automática
- [x] Permitir anexar conexões específicas a cada Atendente de IA
- [x] Permitir anexar fluxos à Seletora com uma descrição de quando usar cada um
- [x] Fazer a Orquestradora respeitar conexões e fluxos permitidos no modo de teste
- [x] Adicionar regras de quando não enviar e exemplos por fluxo na Seletora
- [x] Permitir que a Seletora analise opcionalmente o conteúdo dos blocos de cada fluxo
- [x] Comparar regras em português com mensagens e fluxos em espanhol do México por intenção
- [x] Adicionar IA de Pagamento com conexões, informações oficiais e tabela de valores OXXO
- [x] Permitir escolher o fluxo para possível comprovante sem confirmar pagamento pela IA
- [x] Incluir Pagamento nas decisões seguras da Orquestradora
- [x] Adicionar perguntas frequentes e respostas oficiais à IA de Atendimento
- [x] Usar a base de conhecimento da IA de Atendimento na decisão segura da Orquestradora

# Nome da campanha no registro de venda

- [x] Capturar Source ID e título do anúncio recebidos pela uazapiGO
- [x] Buscar automaticamente a campanha atual na Meta quando houver Source ID
- [x] Confirmar com novas conversas vindas de anúncio pela uazapiGO
- [x] Atualizar os dados da conversa ao abrir o registro de venda

# Automação Inteligente — Mensagens Treinadas

- [x] Adicionar a IA de Mensagens Treinadas à Central
- [x] Criar fila protegida para novas mensagens e regras de resposta oficial
- [x] Capturar mensagens novas dos quatro provedores sem duplicar registros
- [x] Comparar intenção e contexto em português e espanhol mexicano
- [x] Preservar a resposta oficial exatamente como cadastrada
- [x] Permitir ensinar, ignorar, marcar como não responder, editar, desativar e excluir regras
- [x] Manter toda correspondência no modo de teste sem enviar ao cliente
- [x] Perguntar o que fazer em cada cenário e qual mensagem literal usar
- [x] Permitir treinar ações sem resposta, espera, encaminhamento e outras ações
- [x] Comparar novas mensagens com o contexto completo dos cenários aprendidos
