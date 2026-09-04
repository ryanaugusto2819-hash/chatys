# Reconstruir o envio pela extensão

## Objetivo
Substituir o mecanismo atual por um fluxo simples e direto, preservando o CRM, os computadores cadastrados e os comandos já existentes.

## Problema confirmado
O CRM cria e entrega os comandos corretamente, e o computador permanece online. A falha ocorre dentro do Chrome quando o processo em segundo plano conversa com a aba do WhatsApp por um canal que é encerrado durante a troca de conversa. Esse é exatamente o ponto que gera a mensagem recorrente sobre `message channel closed`.

## O que será reconstruído
- A própria aba do WhatsApp Web consultará os novos comandos e enviará o resultado diretamente ao CRM.
- O processo em segundo plano deixará de intermediar os envios e ficará somente com configuração, instalação e diagnóstico.
- Nenhum envio dependerá de `sendMessage`, `sendResponse` ou canal persistente entre processos.
- Texto, mídia, marcar como lido e simular digitação continuarão usando a mesma fila e o mesmo computador vinculado.
- A extensão mostrará versão ativa, último contato e último erro real.

## Segurança contra duplicidade
- Cada comando continuará identificado por um código único.
- Antes de executar, a extensão registrará localmente que o comando começou.
- Depois do envio, confirmará sucesso ou falha no CRM.
- Comandos interrompidos serão retomados de forma controlada, sem repetir os já concluídos.

## Validação
- Gerar uma nova versão com número diferente.
- Confirmar que o pacote baixado contém apenas o novo fluxo.
- Validar conexão, retirada do comando e confirmação de resultado.
- Conferir que novos erros não contêm mais a mensagem de canal fechado.
