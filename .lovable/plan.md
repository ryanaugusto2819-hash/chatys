# Agrupar respostas consecutivas antes de continuar o fluxo

## O que será corrigido
- Ao receber a primeira resposta, manter o bloco **Aguardando Resposta** aberto por uma janela curta de 5 segundos.
- Se o cliente enviar outras mensagens nesse intervalo, reiniciar a contagem e juntar todas em uma única resposta, na ordem correta.
- Só depois de 5 segundos sem novas mensagens retomar o fluxo e entregar o conjunto completo à **Condição Inteligente**.
- Garantir que apenas uma retomada seja executada, mesmo quando duas mensagens chegam quase simultaneamente.

## Segurança do fluxo
- Vincular a retomada às mensagens recebidas depois que o bloco começou a aguardar, evitando reutilizar mensagens antigas.
- Preservar áudios: transcrever antes da análise e incluir a transcrição junto das demais mensagens do intervalo.
- Se a transcrição ou a retomada falhar, manter a execução aguardando em vez de perder a resposta.
- Evitar que uma segunda chamada do canal dispare outra automação ou resposta automática enquanto o agrupamento estiver pendente.

## Histórico e validação
- Registrar no histórico quantas mensagens foram agrupadas e o período considerado.
- Testar respostas fragmentadas como **“Su” + “Si”**, frases divididas em várias mensagens, áudio seguido de texto e mensagens simultâneas.
- Confirmar o comportamento nos quatro canais e verificar que uma mensagem única sofre apenas o atraso curto configurado.
