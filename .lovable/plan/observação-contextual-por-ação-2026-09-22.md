# Observação contextual por ação

## Objetivo
Adicionar em cada ação ensinada um campo **Observação da ação**, separado da mensagem enviada, para registrar por que aquela decisão deve ser tomada.

## Implementação
- Mostrar o campo em cada combinação de país e contexto durante o treinamento.
- Salvar a observação junto à regra aprendida, sem enviá-la ao cliente.
- Exibir e permitir editar a observação em **Respostas ativas**.
- Incluir a observação no catálogo analisado pela IA, ajudando-a a diferenciar cenários semelhantes.
- Manter as condições existentes de país, etiqueta, ação, mensagens e fluxo.

## Segurança
- A observação serve apenas como contexto interno.
- Ela nunca será enviada ao cliente nem poderá confirmar pagamento.
- O modo de teste continuará ativo.
