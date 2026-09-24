# Base de Conhecimento por etiquetas

## Objetivo
Permitir que cada conteúdo da Base de Conhecimento seja associado a uma ou várias etiquetas. Quando o bloco **Resposta Inteligente** for executado, a IA usará somente conteúdos compatíveis com as etiquetas atuais do cliente, além do nicho e país já configurados.

## Alterações na tela
- Carregar as etiquetas do espaço de trabalho na página **Base de Conhecimento**.
- Adicionar um seletor múltiplo de etiquetas ao cadastro de conteúdo.
- Permitir vincular o mesmo conteúdo a mais de uma etiqueta.
- Mostrar as etiquetas vinculadas em cada conteúdo cadastrado.
- Tratar conteúdo sem etiqueta como conteúdo geral, disponível para qualquer cliente compatível com nicho e país.

## Regras da IA
- No modo automático, consultar as etiquetas atuais do cliente antes de buscar a base.
- Incluir conteúdos gerais e conteúdos que correspondam a pelo menos uma etiqueta do cliente.
- Manter os filtros existentes de espaço de trabalho, nicho e país.
- No modo de conteúdos escolhidos manualmente no bloco, preservar a seleção explícita do usuário.
- Registrar nos logs quais conteúdos foram consultados, como já ocorre hoje.

## Estrutura técnica
- Criar uma tabela de vínculo entre conteúdos da base e etiquetas, com isolamento por espaço de trabalho, permissões e índices.
- Salvar os vínculos depois da criação de textos, perguntas/respostas, arquivos e importações de fluxo.
- Atualizar a função de execução do fluxo para filtrar os conteúdos automaticamente pelas etiquetas do telefone do cliente.
- Atualizar os tipos gerados e validar a tela e a função publicada.
