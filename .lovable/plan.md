# Adicionar uazapiGO como provedor completo

## Objetivo
Manter as conexões atuais e adicionar **uazapiGO** como uma nova opção selecionável por número. Cada conversa continuará usando a conexão pela qual entrou, sem misturar provedores.

## O que será implementado
- Adicionar **uazapiGO** na tela de nova conexão, com URL da instância e token próprios.
- Validar a conexão, exibir o estado real e permitir conectar/reconectar por QR Code quando necessário.
- Criar o recebimento dedicado da uazapiGO para:
  - texto, imagem, vídeo, áudio e documento;
  - mensagens enviadas pelo próprio número;
  - atualizações de enviado, entregue, lido e falha;
  - ignorar grupos e evitar mensagens duplicadas.
- Criar o envio dedicado da uazapiGO para mensagens manuais e mídias.
- Direcionar automações, respostas da IA, follow-ups e termos pelo provedor vinculado à conversa.
- Preservar Evolution, Z-API e WhatsApp Cloud como opções independentes.
- Mostrar no cartão da conexão a URL de webhook correta para configurar na uazapiGO.

## Segurança e isolamento
- Guardar token somente na configuração protegida da conexão.
- Validar o usuário nas ações administrativas.
- Resolver cada mensagem pelo identificador da conexão, garantindo isolamento entre números e setores.
- Retornar erros detalhados da uazapiGO ao chat, sem respostas genéricas.

## Validação
- Validar todas as funções alteradas.
- Testar criação da conexão, status, webhook e envios de texto/mídia com respostas simuladas.
- Confirmar que a aplicação compila sem erros.

## Dependência externa
A integração ficará pronta para receber as credenciais. Para o teste real será necessário informar, na própria tela da conexão, a URL da sua instância uazapiGO e o token emitido por ela.
