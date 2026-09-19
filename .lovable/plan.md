# IA de Pagamento

## Objetivo
Adicionar uma IA de Pagamento à Central, acionada somente pela Orquestradora. Ela cuidará das informações de pagamento, gerará OXXO depois que o cliente informar a quantidade de amostras e reconhecerá possíveis comprovantes para disparar um fluxo configurado.

## Configuração na Central
- Adicionar “IA de Pagamento” à lista de IAs, mantendo as atuais.
- Permitir selecionar as conexões em que ela funciona.
- Criar campos para as instruções e informações de pagamento que ela pode enviar.
- Criar uma tabela configurável de quantidade de amostras e valor final em MXN.
- Permitir anexar um fluxo específico para quando um comprovante for identificado.
- Manter a IA inicialmente em modo de teste, sem enviar mensagens nem gerar cobranças reais.

## Decisão e segurança
- Incluir Pagamento nas opções da Orquestradora e dar prioridade quando houver intenção de pagar, dúvida de pagamento, quantidade informada ou possível comprovante.
- A IA de Pagamento nunca será chamada diretamente pelos webhooks; somente pela Orquestradora.
- A geração OXXO exigirá uma quantidade presente na tabela configurada e uma intenção clara do cliente.
- Antes de gerar, verificar se já existe voucher ativo recente para evitar cobranças duplicadas.
- Um comprovante identificado não marcará pagamento como confirmado. A IA enviará apenas o fluxo anexado; a etiqueta PAGO continuará dependendo da confirmação oficial da XPag.

## Funcionamento
- Analisar texto, imagem e documento recebidos para classificar: dúvida de pagamento, quantidade escolhida, pedido de OXXO ou possível comprovante.
- Para informações de pagamento, responder usando somente os dados configurados na própria IA.
- Para OXXO, usar o valor exato da tabela por quantidade, gerar o voucher, enviar código e referência e aplicar a etiqueta OXXO.
- Para comprovante, executar o fluxo anexado uma única vez, respeitando histórico e regras de duplicidade.
- Registrar decisão, ação, motivo, confiança e resultado no histórico da Central.

## Implementação técnica
- Ampliar as restrições da base para aceitar o agente `payment` e guardar sua tabela de preços e fluxo de comprovante em configuração protegida por workspace.
- Criar uma função dedicada para análise e execução da IA de Pagamento, reutilizando a integração OXXO existente.
- Adaptar a Orquestradora para chamadas internas seguras e despacho exclusivo da IA escolhida quando o modo ao vivo for liberado.
- Preservar o modo de teste atual: ele registra o que faria, mas não envia, não executa fluxo e não gera OXXO.

## Validação
- Confirmar salvamento das conexões, informações de pagamento, tabela por quantidade e fluxo de comprovante.
- Testar em modo seguro cenários de dúvida, quantidade válida, quantidade não cadastrada e imagem de possível comprovante.
- Verificar bloqueio de duplicidade, ausência de ações reais no modo de teste e compatibilidade com português/espanhol mexicano.
