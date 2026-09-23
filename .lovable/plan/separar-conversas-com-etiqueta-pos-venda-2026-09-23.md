# Separar conversas com etiqueta POS VENDA

## Resultado
- Conversas que tenham a etiqueta `POS VENDA` deixarão de aparecer em **Todos**.
- Essas conversas aparecerão em **Pós-Venda**, mesmo que o setor ainda não tenha sido alterado manualmente.
- A comparação da etiqueta será tolerante a maiúsculas, minúsculas e espaços extras.

## Implementação
- Atualizar a consulta paginada da caixa de entrada para aplicar a regra diretamente antes da contagem e paginação.
- Em **Todos**, excluir contatos vinculados à etiqueta `POS VENDA` no mesmo espaço de trabalho.
- Em **Pós-Venda**, incluir conversas cujo setor seja `pos_venda` ou cujo contato tenha a etiqueta `POS VENDA`.
- Preservar os filtros atuais de pesquisa, status, atendente, conexão, não lidas e demais etiquetas.

## Validação
- Confirmar a nova regra no banco e verificar que o aplicativo continua compilando sem erros.
