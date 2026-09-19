# Integrar cobranças OXXO na conversa

## Objetivo
Permitir gerar um voucher OXXO diretamente dentro de uma conversa, exibir a referência e o código de barras no CRM e atualizar automaticamente a cobrança quando a XPag confirmar o pagamento.

## Experiência no CRM
- Adicionar uma área **Cobrança OXXO** no painel lateral da conversa.
- Formulário com valor em MXN (mínimo 10 e máximo 10.000), nome e e-mail opcionais.
- Gerar com `generateCheckout: false`, mantendo o pagador dentro do CRM.
- Após a criação, mostrar status, valor, taxa, referência copiável e imagem do código de barras.
- Manter o histórico de vouchers daquela conversa, incluindo pendentes, pagos e falhas.
- Atualizar a tela automaticamente quando o pagamento for confirmado.

## Integração segura
- Criar uma função protegida para chamar `POST https://api.xpag.global/cashin` com `X-Client-Id` e `X-Client-Secret` somente no servidor.
- Validar a sessão, o acesso ao workspace, os campos e a faixa do valor antes de chamar a XPag.
- Criar uma URL pública exclusiva para confirmações da XPag, protegida por uma chave aleatória não exibida no navegador.
- Processar confirmações de forma idempotente, conciliando por `transaction_id`, `request_number` e `external_id`.
- Preservar o status e o corpo de erros da XPag para mostrar diagnósticos claros no CRM.

## Dados
- Criar uma tabela de cobranças OXXO vinculada à conversa e ao workspace.
- Guardar valor, taxa, referência, código de barras, identificadores da XPag, status e datas de criação/confirmação.
- Aplicar acesso por workspace; apenas a função de confirmação poderá atualizar pagamentos sem sessão de usuário.

## Credenciais e publicação
- Solicitar em formulário seguro `XPAG_CLIENT_ID` e `XPAG_CLIENT_SECRET` após a estrutura estar pronta.
- Gerar e armazenar automaticamente uma chave interna para proteger o webhook.
- Publicar e testar a criação sem registrar ou retornar credenciais.

## Validação
- Testar limites de 10 e 10.000 MXN, campos inválidos, falhas da XPag e criação bem-sucedida.
- Simular confirmações repetidas para garantir que uma cobrança não seja duplicada.
- Verificar no computador e celular a geração, cópia da referência, código de barras e atualização para pago.

## Observação
A documentação enviada não informa assinatura própria dos webhooks. A primeira versão protegerá a URL com uma chave secreta exclusiva; se a XPag fornecer assinatura por cabeçalho, ela será adicionada à validação.
