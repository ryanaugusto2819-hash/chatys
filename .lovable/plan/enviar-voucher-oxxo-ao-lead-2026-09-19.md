# Enviar voucher OXXO ao lead

## O que será feito
- Adicionar em cada voucher gerado um botão **Enviar ao lead**.
- Enviar primeiro o código de barras como imagem pelo mesmo canal WhatsApp da conversa.
- Enviar junto uma mensagem com o valor em MXN, a referência digitável e a orientação de pagamento na OXXO.
- Mostrar carregamento, sucesso e erro no próprio fluxo, impedindo envios duplicados enquanto estiver processando.

## Detalhes técnicos
- Reutilizar o envio já existente no CRM para respeitar automaticamente o provedor escolhido na conexão.
- Disponibilizar o envio do chat ao painel OXXO por uma função recebida como propriedade.
- Manter o botão indisponível quando o voucher ainda não possuir referência ou imagem.
- Não alterar geração, cobrança ou confirmação do voucher.

## Validação
- Conferir o botão e seus estados na conversa.
- Validar tipos e compilação do projeto.
