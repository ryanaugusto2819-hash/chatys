# Gerar voucher OXXO pelo DataCrazy

## Objetivo
Transformar o webhook DataCrazy em uma entrada de cobrança: receber `amount` e `phone`, localizar a conversa mais recente desse telefone, gerar o voucher OXXO e devolver a URL do código de barras com a referência digitável.

## Comportamento
- Aceitar somente `POST` com JSON.
- Validar `amount` entre 10 e 10.000 MXN e normalizar `phone` mantendo apenas dígitos.
- Localizar a conversa mais recentemente atualizada cujo telefone normalizado corresponda ao recebido.
- Gerar a cobrança diretamente na XPag, registrar o voucher no histórico OXXO da conversa e manter a confirmação automática já existente.
- Responder JSON com `success`, URL da imagem do código de barras, referência, valor, status e identificadores da cobrança.
- Retornar erros claros quando o JSON for inválido, o lead não existir, a XPag falhar ou não devolver o voucher.

## Segurança e duplicidade
- Conforme escolhido, o endpoint continuará público e sem chave de autenticação. Isso significa que qualquer pessoa com a URL poderá gerar cobranças reais.
- Como o DataCrazy não envia um identificador único, evitar duplicações reutilizando uma cobrança criada recentemente para o mesmo telefone e valor, dentro de uma janela curta.
- Nunca retornar credenciais da XPag nem dados internos desnecessários.

## Validação
- Publicar a função atualizada.
- Testar método inválido, JSON inválido, valor fora da faixa e telefone não encontrado.
- Fazer um teste controlado de geração apenas se houver um telefone real indicado para isso; não criaremos uma cobrança real automaticamente durante a validação técnica.
