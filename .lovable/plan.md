# Até cinco caminhos na Condição Inteligente

## O que será feito
- Manter X e Y como caminhos iniciais.
- Adicionar um botão para criar, um por vez, os caminhos Z, W e V, até o limite de cinco.
- Permitir remover somente os caminhos adicionais ainda não desejados.
- Mostrar um campo de descrição e uma saída conectável para cada caminho ativo.
- Exigir descrição e conexão em todos os caminhos configurados antes de salvar.

## Decisão da IA
- Classificar a resposta em exatamente um dos caminhos ativos ou como nenhuma correspondência.
- Executar somente a conexão do caminho escolhido.
- Parar o fluxo para revisão quando houver ambiguidade, baixa confiança ou nenhuma correspondência clara.
- Manter compatibilidade com blocos antigos que possuem somente X e Y.

## Validação
- Criar um bloco com três, quatro e cinco caminhos e confirmar campos, conexões e persistência.
- Confirmar que cada resposta segue somente pela saída correspondente.
- Confirmar que respostas ambíguas continuam parando para revisão.
- Validar fluxos antigos, compilação e função publicada.
