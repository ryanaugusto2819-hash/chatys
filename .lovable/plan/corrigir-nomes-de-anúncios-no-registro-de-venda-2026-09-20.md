# Corrigir nomes de anúncios no registro de venda

## Diagnóstico confirmado
- A busca funciona para alguns Source IDs, mas outros retornam “anúncio não encontrado” em todos os 10 acessos configurados.
- Quando a Meta retorna esse resultado, o formulário não entra no tratamento de erro e deixa “Campanha” vazio.
- O nome já salvo na conversa só é usado quando ocorre uma falha de conexão, não quando a resposta válida informa que o anúncio não foi encontrado.

## Alterações
- Sempre preencher “Campanha” com o nome salvo enquanto a busca atual é feita.
- Substituir pelo nome atualizado quando a Meta localizar o anúncio.
- Manter o nome salvo quando nenhum acesso reconhecer o Source ID, mostrando um aviso claro em vez de apagar o campo.
- Fazer a função retornar diagnóstico estruturado da Meta, sem expor tokens, para diferenciar anúncio sem permissão, removido ou acesso expirado.

## Validação
- Testar um Source ID que a Meta encontra e confirmar o nome atualizado.
- Testar um Source ID indisponível e confirmar que o nome salvo permanece visível.
- Validar o registro da venda, a função publicada e a tela sem erros.
