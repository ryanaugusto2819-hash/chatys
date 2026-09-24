# Bloco Aguardando Resposta

## Objetivo
Adicionar ao construtor visual o bloco **Aguardando Resposta**, mantendo o sistema atual de arrastar e conectar. Ao alcançá-lo, o fluxo fica pausado até a próxima mensagem do cliente ou até o prazo configurado terminar.

## Experiência no construtor
- Adicionar **Aguardando Resposta** na seção **Lógica**.
- Permitir configurar um número e a unidade do prazo: minutos, horas ou dias; padrão de 24 horas.
- Exibir duas saídas conectáveis no bloco:
  - **Respondeu**: usada quando chega a próxima mensagem do cliente.
  - **Tempo esgotado**: usada quando não há resposta dentro do prazo.
- Exigir que o prazo e as duas conexões estejam configurados antes de salvar.
- Salvar e recarregar as duas conexões sem alterar os fluxos antigos.

## Pausa e retomada
- Ao chegar ao bloco, registrar a execução como aguardando resposta, incluindo o bloco atual, o horário de início e o vencimento.
- Encerrar a execução atual sem manter uma função aberta durante a espera.
- Na próxima mensagem recebida do cliente, reservar de forma atômica a espera ativa e retomar exatamente pela saída **Respondeu**.
- A retomada terá prioridade sobre a seleção de um novo fluxo e sobre a resposta automática, evitando respostas duplicadas para a mesma mensagem.
- Se houver mais de uma espera antiga na mesma conversa, retomar somente a mais recente e encerrar as anteriores como substituídas.

## Prazo esgotado
- Criar um processador periódico e limitado para localizar esperas vencidas e retomar pela saída **Tempo esgotado**.
- Processar em lotes de até 50 registros, de forma idempotente, para evitar duplicidade e respeitar o limite das funções.
- Usar uma checagem a cada minuto; o caminho de prazo pode iniciar com atraso máximo aproximado de um minuto.

## Histórico e segurança
- Registrar no histórico quando o fluxo entrou em espera, quando recebeu resposta e quando o prazo terminou.
- Impedir que a mesma espera seja retomada duas vezes por mensagens simultâneas ou pela disputa entre resposta e vencimento.
- Validar que execução, conversa, fluxo, bloco e conexão pertencem ao mesmo contexto antes de continuar.
- Manter as regras atuais de bloqueio pós-venda e compatibilidade com todos os provedores de WhatsApp.

## Validação
- Confirmar visualmente o bloco, os campos de prazo e os conectores **Respondeu** e **Tempo esgotado**.
- Testar pausa e retomada por mensagem recebida em cada entrada de WhatsApp usada pelo sistema.
- Testar o caminho de prazo esgotado sem enviar a continuação duas vezes.
- Confirmar que fluxos antigos continuam executando normalmente e que a compilação permanece válida.
