# Webhook de diagnóstico DataCrazy

## Implementação
- Criar a função pública `datacrazy-webhook` para receber apenas requisições POST.
- Aceitar qualquer corpo JSON válido e registrar integralmente o conteúdo recebido nos logs.
- Responder `200` com `{ "success": true }` sem processar ou alterar dados.
- Responder com erro claro para métodos diferentes de POST ou JSON inválido.
- Publicar a função e testar as respostas esperadas.

## Segurança
- Não exigir sessão de usuário, pois a chamada virá do DataCrazy.
- Não acessar tabelas, arquivos ou outros dados do CRM nesta etapa de diagnóstico.
