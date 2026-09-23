# Revisão de comprovantes e registro de venda

## O que será adicionado

- A análise de imagens passará a identificar se há um possível comprovante e extrair o valor, a moeda e a confiança da leitura.
- O resultado ficará como **pendente de revisão**; a IA não confirmará pagamento nem registrará venda sozinha.
- No histórico da Automação Inteligente, cada comprovante mostrará imagem, valor detectado, confiança, motivo e situação da revisão.
- Um administrador poderá **Aprovar e registrar venda** ou **Rejeitar** a leitura.

## Registro da venda

- Ao aprovar, o sistema validará novamente a conversa, o espaço de trabalho, o valor positivo e se a venda já foi registrada.
- A aprovação criará uma única venda com o valor revisado e marcará a conversa como venda registrada, interrompendo as automações comerciais já bloqueadas após venda.
- O valor poderá ser corrigido pelo administrador antes da aprovação.
- Repetições, cliques duplicados e novas análises do mesmo comprovante não poderão duplicar a venda.

## Logs e segurança

- Cada análise registrará valor/moeda reconhecidos e confiança.
- Cada aprovação ou rejeição registrará data, responsável, valor final, venda vinculada e eventual erro.
- Somente administradores do espaço de trabalho poderão aprovar ou rejeitar.
- O histórico continuará disponível na própria Automação Inteligente, com filtros e estado claro: pendente, aprovado, rejeitado ou falhou.

## Detalhes técnicos

- Criar campos de revisão na fila de treinamento e uma operação protegida no banco para aprovar de forma atômica e idempotente.
- Estender a leitura visual estruturada sem aceitar texto livre como confirmação.
- Atualizar a tela e publicar a função de análise.
- Validar análise, correção de valor, aprovação, rejeição, duplicidade e bloqueio pós-venda.
