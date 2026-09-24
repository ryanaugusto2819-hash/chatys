# Bloco IA — Reconhecer Comprovante

## Objetivo
Adicionar ao construtor de automações o bloco **Reconhecer Comprovante**, mantendo o padrão de arrastar e conectar. Quando o fluxo chegar nele, a IA analisará a imagem mais recente enviada pelo cliente e encaminhará a execução por um de três caminhos.

## Comportamento do bloco
- Adicionar o bloco na categoria **IA/Interação**, com identificação visual própria.
- Usar a imagem mais recente enviada pelo cliente na conversa.
- Criar três saídas obrigatórias:
  - **Comprovante**: a imagem parece ser um comprovante com confiança suficiente.
  - **Não é comprovante**: não existe imagem recente ou a imagem não apresenta evidências suficientes.
  - **Erro**: houve falha ao acessar a mídia ou consultar a IA.
- Exigir que as três saídas estejam conectadas antes de salvar o fluxo.
- Permitir configurar a confiança mínima, usando 75% como padrão.

## Análise e revisão
- Reutilizar a análise visual segura já existente para identificar possível comprovante, valor, moeda, confiança e motivo.
- Nunca confirmar pagamento nem registrar venda automaticamente.
- Quando reconhecer um possível comprovante, criar ou atualizar uma única pendência de revisão vinculada à mensagem original.
- Mostrar essa pendência no histórico atual da Automação Inteligente para um administrador aprovar, corrigir o valor ou rejeitar.
- Garantir que reexecuções do mesmo bloco e da mesma mensagem não criem pendências duplicadas.

## Segurança e registros
- Usar `openai/gpt-6-astra` no Lovable AI, no servidor, enviando a imagem pelo formato multimodal correto.
- Preservar o isolamento por espaço de trabalho e conversa.
- Registrar no histórico do fluxo: mensagem analisada, resultado, valor, moeda, confiança, motivo e erro seguro.
- Registrar o consumo da IA.
- Repetir somente falhas temporárias (`429` e `5xx`) com espera progressiva; demais falhas seguem diretamente para **Erro**.

## Implementação técnica
- Atualizar catálogo, cartão, editor, prévia, validação e persistência das três conexões.
- Extrair a análise de comprovantes para uma rotina compartilhada pelas funções atuais e pelo executor do fluxo, evitando regras diferentes.
- No executor, localizar a última mensagem de imagem do cliente, resolver com segurança a URL privada, analisar e direcionar pela saída correspondente.
- Reaproveitar `ai_training_queue`, `ai_receipt_review_logs` e o processo administrativo atual de aprovação; não criar um segundo sistema de revisão.
- Manter compatibilidade com fluxos existentes.

## Validação
- Testar visualmente o novo bloco, a confiança mínima e as três conexões.
- Testar imagem de comprovante, imagem comum, conversa sem imagem, mídia indisponível, baixa confiança e reexecução sem duplicidade.
- Confirmar que o comprovante reconhecido aparece pendente para revisão e que nenhuma venda é registrada automaticamente.
- Publicar a função e confirmar compilação e registros sem erros.
