# Bloco Resposta Inteligente

## Objetivo
Adicionar ao construtor visual o bloco **Resposta Inteligente**, mantendo o mesmo padrão de arrastar e conectar. Quando executado, ele analisará a última mensagem do cliente com o histórico recente, buscará apenas conteúdo permitido para o nicho e país da conversa e redigirá uma resposta baseada nessa fonte.

## Comportamento do bloco
- Adicionar o bloco na categoria **IA**, com resumo visual da configuração.
- Criar três saídas conectáveis e exclusivas:
  - **Respondeu**: encontrou conteúdo suficiente, enviou a resposta e segue por esta saída.
  - **Sem resposta**: não encontrou base confiável; não inventa nem envia conteúdo, sinaliza revisão humana e segue pela saída correspondente.
  - **Erro**: houve indisponibilidade técnica ou falha no envio; registra o motivo e segue pela saída de erro.
- Exigir as três conexões antes de salvar o fluxo.
- A saída **Sem resposta** transfere a conversa para atendimento humano, preservando o atendente já atribuído quando houver e deixando-a disponível para atendimento quando não houver.
- A resposta será enviada no mesmo canal da conversa e registrada como mensagem de IA, sem se passar por atendente humano.

## Base de conhecimento
- Usar a base de conhecimento como fonte oficial, separada automaticamente pelo **workspace, nicho e país** da conversa.
- Adicionar país aos conteúdos da base, com opção **Qualquer país** para informações compartilhadas.
- Priorizar conteúdo do país exato e complementar somente com itens marcados para qualquer país, sempre dentro do mesmo nicho.
- Permitir que a IA redija uma resposta nova, mas somente com fatos presentes nos conteúdos recuperados.
- Não usar regras da Automação Inteligente como fonte implícita; elas continuam separadas do conteúdo oficial de respostas.

## Segurança e precisão
- Usar `openai/gpt-6-astra` no Lovable AI, no servidor, com resposta estruturada contendo texto, confiança, IDs das fontes e motivo.
- Considerar a resposta válida apenas quando houver fontes utilizadas, conteúdo não vazio e confiança mínima de 0,75.
- Proibir suposições, alteração de etiquetas, registro de venda e qualquer ação fora da resposta textual.
- Respeitar o bloqueio global pós-venda e o isolamento por workspace/nicho/país.
- Repetir somente falhas temporárias (`429` e `5xx`) com espera progressiva; demais erros seguem diretamente para **Erro**.

## Auditoria
- Criar histórico próprio por execução com conversa, fluxo, bloco, mensagem analisada, contexto resumido, país, nicho, fontes consultadas/usadas, resposta, confiança, resultado e erro seguro.
- Registrar também o uso da IA e o resultado do envio nos históricos já existentes do fluxo.
- Garantir idempotência por execução e bloco para não enviar a mesma resposta duas vezes em retomadas ou chamadas simultâneas.

## Implementação técnica
- Atualizar o catálogo, cartão, editor, validação e persistência das três conexões no construtor.
- Adicionar `country_code` à base de conhecimento e criar uma tabela de logs com permissões e políticas por workspace.
- Implementar no executor a recuperação da base, geração estruturada, decisão de saída, envio multicanal e persistência da mensagem.
- Reaproveitar o roteamento existente para WhatsApp Cloud, Z-API, Evolution e uazapigo.
- Manter compatibilidade com os blocos **Condição Inteligente** e **Aguardando Resposta** e com fluxos já publicados.

## Validação
- Testar visualmente o bloco, seus campos e as três conexões no construtor.
- Testar: resposta com fonte do país, fallback para conteúdo global, ausência de fonte, baixa confiança, erro da IA, falha de envio, bloqueio pós-venda e prevenção de duplicidade.
- Publicar a função e confirmar compilação e logs sem erros.
