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
- [x] Adicionar condições obrigatórias e bloqueadoras por etiquetas em cada cenário
- [x] Filtrar regras por etiquetas antes da comparação de significado

# Menu — Automação Inteligente

- [x] Adicionar item exclusivo no menu para a IA de Mensagens Treinadas
- [x] Abrir a área de treinamento existente sem redesenhar a Central

# Painel próprio — Automação Inteligente

- [x] Separar visualmente da Central de IAs
- [x] Remover lista dos demais Atendentes da página exclusiva
- [x] Manter treinamento, conexões, etiquetas e cenários aprendidos
- [x] Validar acesso direto pelo menu

# Etapas no bloco de treinamento

- [x] Mostrar Etapa 1, Etapa 2, Pago e Pós-venda após a ação do cenário
- [x] Salvar a etapa escolhida como a ação correta do cenário
- [x] Validar salvamento e tela

# Respostas diferentes por etiqueta

- [x] Tratar Etapa 1, Etapa 2, Pago e Pós-venda somente como contexto
- [x] Permitir comportamento e mensagem próprios para cada etiqueta
- [x] Salvar uma regra independente por etiqueta sem alterar o cliente
- [x] Filtrar correspondências pela etiqueta atual do cliente
- [x] Validar painel e função da IA

# Filtros e histórico da Automação Inteligente

- [x] Adicionar filtros Aguardando treinamento, Respostas ativas e Histórico
- [x] Manter respostas aprendidas editáveis
- [x] Mostrar decisão, confiança, motivo e estado real de envio
- [x] Validar desktop, celular e build

# Transcrição de áudio na Automação Inteligente

- [x] Transcrever áudios antes da análise da IA
- [x] Salvar a transcrição na fila e no contexto de treinamento
- [x] Mostrar claramente que o texto veio de um áudio
- [x] Preservar erros reais sem respostas genéricas
- [x] Publicar e testar com áudio real

# Ações com mensagens e fluxos na Automação Inteligente

- [x] Adicionar ações Responder, Enviar fluxo e Responder depois enviar fluxo
- [x] Salvar e validar o fluxo escolhido em cada cenário treinado
- [x] Permitir editar mensagem, ação e fluxo nas respostas ativas
- [x] Exibir o fluxo selecionado no histórico
- [x] Publicar e validar o painel em modo de teste

# Várias mensagens por cenário

- [x] Permitir uma sequência ordenada de mensagens em cada resposta treinada
- [x] Adicionar, remover e reordenar mensagens no treinamento e nas respostas ativas
- [x] Preservar respostas antigas como a primeira mensagem da sequência
- [x] Exibir todas as mensagens na ordem correta no teste e no histórico
- [x] Manter envios reais desativados no modo de teste

# Cenário sem etiqueta

- [x] Adicionar contexto fixo para clientes sem nenhuma etiqueta
- [x] Permitir mensagens e fluxo próprios nesse contexto
- [x] Bloquear a regra sem etiqueta quando o cliente possuir qualquer etiqueta
- [x] Permitir identificar e editar essa condição nas respostas ativas
- [x] Manter a automação em modo de teste

# Filtro de país na Automação Inteligente

- [x] Identificar México, Uruguai e Argentina pelo DDI do telefone
- [x] Permitir ações diferentes por país e contexto
- [x] Adicionar regra geral para qualquer país como alternativa
- [x] Impedir correspondência com regras específicas de outro país
- [x] Mostrar e editar o país nas respostas ativas e no histórico
- [x] Mostrar nome, telefone e país nas pendências e no histórico
- [x] Filtrar pendências, respostas ativas e histórico por país

# Aguardar próxima mensagem

- [x] Permitir treinar a IA para não enviar mensagem nem fluxo e aguardar o próximo contato do cliente
- [x] Exibir as etiquetas atuais do lead ou “Sem tag” nas pendências e no histórico

# Imagens na Automação Inteligente

- [x] Carregar imagens privadas recebidas na fila e no histórico
- [x] Analisar imagens como possível comprovante sem confirmar o pagamento
- [x] Abrir diretamente a conversa do cliente pela pendência ou pelo histórico

# Observação contextual por ação

- [x] Adicionar uma observação interna separada para cada ação treinada
- [x] Permitir editar a observação nas respostas ativas
- [x] Usar a observação na comparação da IA sem enviá-la ao cliente

# Busca de fluxos na Automação Inteligente

- [x] Permitir pesquisar fluxos pelo nome durante o treinamento e a edição

# Histórico detalhado da Automação Inteligente

- [x] Mostrar mensagem recebida, entendimento da IA e ação tomada
- [x] Exibir a instrução, o exemplo e a observação da base usada na decisão
- [x] Manter acesso direto ao chat do cliente em cada registro

# Inteligência e auditoria da Automação Inteligente

- [x] Salvar uma cópia imutável da base usada em cada decisão
- [x] Agrupar mensagens semelhantes aguardando treinamento
- [x] Permitir avaliar decisões como corretas ou erradas
- [x] Detectar e mostrar conflitos entre regras treinadas
- [x] Buscar no histórico por lead, telefone, mensagem, etiqueta, ação ou fluxo

# Corte de novas conversas no treinamento

- [x] Considerar somente conversas cuja primeira mensagem ocorreu após 22/09/2026 às 20:21 (São Paulo)
- [x] Ocultar da fila de treinamento conversas iniciadas antes do corte
- [x] Impedir que novas mensagens de conversas antigas voltem para a fila

# Etiquetas nos blocos de ação

- [x] Executar de fato as ações de adicionar e remover etiqueta nos fluxos
- [x] Restringir a alteração ao telefone e workspace corretos
- [x] Registrar falha real no histórico quando a etiqueta estiver ausente ou inválida

# Revisão de comprovantes e registro de venda

- [x] Extrair valor, moeda e confiança das imagens de possíveis comprovantes
- [x] Manter o pagamento pendente até revisão manual de um administrador
- [x] Permitir corrigir o valor antes de aprovar e registrar a venda uma única vez
- [x] Permitir rejeitar o comprovante sem registrar venda
- [x] Exibir análise, revisão, valor final e resultado no histórico

# Aprendizados por nicho e país

- [x] Vincular fila de treinamento e regras aprendidas ao nicho da conversa
- [x] Isolar a comparação da IA por nicho e manter prioridade por país
- [x] Adicionar filtro e criação de nichos na Automação Inteligente
- [x] Mostrar somente funis do mesmo nicho durante o treinamento
- [x] Publicar a função e validar a compilação
- [ ] Validar a tela autenticada; a conta do solicitante ainda não existe nesta aplicação

# Separação automática de Pós-Venda

- [x] Remover de Todos as conversas com a etiqueta POS VENDA
- [x] Mostrar em Pós-Venda as conversas com a etiqueta POS VENDA
- [x] Preservar contagem, paginação e filtros da caixa de entrada
- [x] Validar a regra com os dados atuais e confirmar a compilação

# Condição Inteligente X/Y

- [x] Adicionar o bloco visual com duas saídas conectáveis
- [x] Salvar e recarregar as conexões X/Y
- [x] Classificar última resposta com contexto e executar somente um caminho
- [x] Parar e registrar revisão quando não houver correspondência clara
- [x] Publicar e validar fluxos novos e antigos

# Bloco Aguardando Resposta

- [x] Adicionar o bloco visual com prazo e duas saídas conectáveis
- [x] Persistir a pausa sem manter uma função aberta
- [x] Retomar pela próxima mensagem nos quatro canais de WhatsApp
- [x] Processar o prazo esgotado em lotes de até 50 esperas
- [x] Publicar funções e validar pausa, resposta e prazo
