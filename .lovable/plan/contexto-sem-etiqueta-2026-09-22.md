# Contexto sem etiqueta

## Alteração
- Adicionar a opção fixa **Sem etiqueta** junto de Etapa 1, Etapa 2, Pago e Pós-venda.
- Permitir configurar ação, várias mensagens e fluxo próprios para clientes sem nenhuma etiqueta.
- Salvar essa condição explicitamente, sem confundi-la com uma regra válida para qualquer cliente.
- Fazer a IA considerar essa resposta somente quando o cliente realmente não tiver etiquetas.
- Permitir editar e identificar essa condição nas respostas ativas.

## Segurança
- Uma regra **Sem etiqueta** nunca será usada se o cliente possuir qualquer etiqueta.
- A IA continuará sem adicionar ou remover etiquetas.
- Tudo permanece em modo de teste, sem envios reais.

## Validação
- Testar cadastro e persistência da nova opção.
- Confirmar que clientes com etiquetas não correspondem à regra **Sem etiqueta**.
- Validar página, função e compilação.
