# Várias mensagens por cenário

## O que será feito
- Permitir cadastrar uma ou várias mensagens nas ações **Responder com mensagem** e **Responder e depois enviar fluxo**.
- Mostrar cada mensagem em um campo separado, com opções para adicionar, remover e mudar a ordem.
- Enviar as mensagens na ordem cadastrada; no modo **Responder e depois enviar fluxo**, o fluxo será executado somente depois de todas as mensagens.
- Manter compatibilidade com respostas já cadastradas, convertendo cada resposta atual na primeira mensagem da sequência.
- Exibir a sequência completa nas respostas ativas e no histórico.

## Detalhes técnicos
- Adicionar uma lista ordenada de mensagens às regras treinadas e à fila de decisões, preservando os campos atuais para compatibilidade.
- Atualizar a análise para devolver a lista exata, sem combinar ou reescrever textos.
- Manter o modo de teste atual: esta alteração não ativará envios reais.

## Validação
- Testar cadastro, edição, exclusão e reordenação de várias mensagens.
- Confirmar persistência após recarregar e exibição correta no histórico.
- Validar a função de análise e a página em desktop e celular.
