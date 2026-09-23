# Aprendizados por nicho e país

## Objetivo
Organizar a Automação Inteligente em bases separadas por nicho e país, para que ensinamentos, etapas e funis de um negócio nunca sejam usados em outro.

## O que será criado
- Seletor de nicho no topo da Automação Inteligente, com opção de criar um novo nicho na própria tela.
- Filtros combinados de nicho e país para pendências, respostas ativas e histórico.
- Cada nova mensagem será classificada pelo nicho atual da conversa e pelo país identificado pelo telefone.
- Cada aprendizado salvo ficará vinculado ao nicho escolhido, ao país, às etiquetas e ao funil selecionado.
- A lista de funis mostrará somente os funis do nicho atual, evitando escolhas cruzadas.
- Itens sem nicho ficarão em uma categoria explícita para organização manual, sem misturar com bases categorizadas.

## Segurança e comportamento
- A IA só poderá comparar uma mensagem com ensinamentos do mesmo nicho.
- Regras de país específico continuam tendo prioridade sobre regras gerais dentro do mesmo nicho.
- O modo de teste permanece ativo: nenhuma mensagem ou funil será enviado automaticamente.
- Dados existentes serão preservados e aparecerão como “Sem nicho” até serem categorizados.

## Detalhes técnicos
- Adicionar vínculo opcional de nicho à fila de treinamento e às regras aprendidas.
- Capturar o nicho da conversa no processamento da IA e aplicar isolamento nas consultas.
- Atualizar a tela, os tipos e os filtros sem alterar o cadastro de nichos já existente em Nichos & IA.
- Publicar a função atualizada e validar tela, isolamento e compilação.
