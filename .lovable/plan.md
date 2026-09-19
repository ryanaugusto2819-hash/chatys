# Fixar fluxos diretamente na conversa

## Objetivo
Transformar o aviso vazio de “Atalhos de Automação” em um seletor simples, permitindo escolher e anexar fluxos sem abrir a página de Automação.

## Alterações
- Adicionar no próprio bloco um botão para escolher fluxos quando nenhum estiver fixado.
- Abrir uma lista pesquisável com todos os fluxos do espaço de trabalho.
- Permitir fixar ou remover vários fluxos para o setor atual, mostrando claramente quais já estão selecionados.
- Atualizar a lista de atalhos imediatamente após salvar, preservando as categorias e o disparo atual.
- Manter o vínculo por setor: Comercial, Cobrança ou Pós‑Venda.

## Detalhes técnicos
- Reutilizar os campos existentes `pinned_sectors` e `is_pinned_sidebar`; nenhuma nova tabela será criada.
- A alteração ficará concentrada no painel de atalhos da conversa.
- Exibir mensagens claras em caso de falha ao salvar.

## Validação
- Conferir o estado vazio, busca, seleção, remoção e execução de um fluxo.
- Validar visualmente em tela desktop e conferir o estado do aplicativo após a alteração.
