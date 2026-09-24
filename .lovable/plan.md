# Bloco de Condição Inteligente X/Y

## Objetivo
Adicionar ao construtor visual um novo bloco de **Condição Inteligente**, mantendo o mesmo sistema de arrastar e conectar, para a IA interpretar a última resposta do lead junto com o contexto recente e escolher exatamente um caminho: **X** ou **Y**.

## Experiência no construtor
- Adicionar **Condição Inteligente** na seção **Lógica**, sem substituir a condição simples já existente.
- O painel do bloco terá dois campos de texto:
  - **Se o lead respondeu X**: descrição livre do significado de X.
  - **Se o lead respondeu Y**: descrição livre do significado de Y.
- O bloco exibirá duas saídas conectáveis e identificadas visualmente como **X** e **Y**.
- Cada saída poderá ser arrastada para qualquer próximo bloco, preservando o layout atual do construtor.
- Salvar e recarregar tanto as duas instruções quanto o caminho de cada conexão.

## Decisão da IA
- Ao alcançar o bloco, analisar a última mensagem recebida do lead e o histórico recente da conversa.
- Classificar a resposta somente como **X**, **Y** ou **nenhuma**.
- X e Y serão mutuamente exclusivos: apenas um caminho poderá continuar.
- Se não houver correspondência clara, interromper o fluxo para revisão humana, sem executar nenhum dos dois caminhos.
- Registrar no histórico da execução a saída escolhida, a confiança e o motivo resumido; em caso de dúvida, registrar a necessidade de revisão.

## Execução dos caminhos
- Persistir nas conexões qual saída originou o vínculo, sem alterar conexões antigas.
- Fazer a execução seguir o desenho real das conexões, em vez de percorrer todos os blocos pela ordem visual.
- Manter compatibilidade com fluxos lineares existentes e com a condição simples atual.
- Impedir ciclos acidentais e execução duplicada de blocos dentro da mesma passagem.

## Segurança e IA
- Executar a análise somente no servidor, usando Lovable AI e sem expor credenciais no navegador.
- Validar configurações vazias ou conexões ausentes antes de ativar/salvar o fluxo.
- Exibir e registrar a mensagem segura retornada pelo serviço quando a análise falhar; não seguir por X ou Y nesses casos.
- Aplicar tentativas limitadas apenas para falhas temporárias permitidas, sem repetir recusas ou erros definitivos.

## Validação
- Criar um fluxo visual com uma pergunta, o bloco inteligente e dois caminhos diferentes.
- Confirmar que uma resposta sobre querer amostra segue somente por X.
- Confirmar que uma resposta em forma de dúvida segue somente por Y.
- Confirmar que uma resposta ambígua para e fica registrada para revisão.
- Salvar, recarregar e confirmar que as conexões X/Y continuam corretas.
- Validar fluxos antigos, execução publicada e compilação.
