# Central Inteligente de IAs

## Objetivo
Reunir todas as funções de IA em uma única central e fazer a **IA Orquestradora** decidir, com base no contexto completo, qual único Atendente de IA pode agir. Nesta primeira etapa, a Orquestradora será configurada e validada; os demais ficarão visíveis, organizados e desativados até serem configurados um por um.

## Estrutura da central
- Exibir sete funções: **Orquestradora**, **Seletora de Fluxo**, **Atendimento**, **Pós-venda**, **Upsell**, **Remarketing** e **Supervisora**.
- Cada função terá status, instruções próprias, critérios de entrada, bloqueios e área de treinamento.
- A Orquestradora ficará destacada como controle principal; as demais indicarão “Aguardando configuração” até serem liberadas.
- Aproveitar a configuração atual de nichos, conexões, base de conhecimento, fluxos e IA Gerente, sem duplicar essas informações.

## IA Orquestradora — primeira configuração
- Ler a conversa recente, estágio do funil, nicho, etiquetas, histórico de fluxos, pagamento/venda e última ação automática.
- Retornar uma decisão estruturada: Atendente escolhido, ação permitida, motivo, confiança e impedimentos encontrados.
- Não responder diretamente ao lead e não enviar mensagens por conta própria.
- Permitir instruções personalizadas por workspace/nicho para você ensinar os critérios de escolha.
- Aplicar regras determinísticas antes da IA: venda registrada bloqueia ações comerciais incompatíveis; Pós-venda exige venda/pagamento; Upsell exige elegibilidade; Remarketing exige inatividade; Supervisora nunca responde ao lead.

## Proteção contra conflitos
- Uma mensagem recebida gera no máximo uma decisão e uma ação automática.
- Criar trava por conversa/mensagem para impedir processamento duplicado ou simultâneo.
- Definir prioridade explícita entre estados críticos, atendimento, fluxo, pós-venda, upsell e remarketing.
- Manter os recursos atuais desativados da execução direta quando a Orquestradora estiver ativa; eles só poderão rodar quando forem escolhidos por ela.
- Preservar a regra global existente: venda registrada interrompe automações comerciais antigas; somente funções pós-pagamento autorizadas poderão atuar depois disso.

## Histórico e controle
- Registrar cada decisão com conversa, mensagem de origem, função escolhida, motivo, confiança, ação executada, duração, resultado e consumo de IA.
- Disponibilizar filtros por função, resultado e período para diagnosticar decisões erradas.
- Incluir modo de teste que mostra a decisão sem enviar nada ao lead.
- Permitir ativar/desativar cada função individualmente e ter um desligamento geral imediato.

## Integração gradual
1. Entregar e testar a Orquestradora em modo de teste.
2. Conectar a Seletora de Fluxo existente somente por decisão da Orquestradora.
3. Configurar Atendimento com sua base de dúvidas e regras.
4. Configurar Pós-venda.
5. Configurar Upsell após pagamento.
6. Configurar Remarketing por inatividade/abandono.
7. Ampliar a Supervisora para avaliar todas as funções, sem contato com o lead.

## Detalhes técnicos
- Criar configurações e registros isolados por workspace e nicho, com acesso administrativo protegido.
- Criar uma função serverless central para decisão e adaptadores para as funções atuais.
- Usar resposta estruturada e validação rígida; decisão inválida resulta em “nenhuma ação”.
- Usar o histórico completo necessário, com limites e resumos para controlar custo e latência.
- Registrar erros estruturados e respeitar os bloqueios de saldo, provedor e pós-venda existentes.
- Manter o envio pelos provedores atuais e não alterar o canal de WhatsApp nesta etapa.

## Validação
- Simular cenários de dúvida, sequência de etapas, pagamento confirmado, pós-venda, upsell, abandono e conflito entre duas funções.
- Confirmar que a Orquestradora nunca fala com o lead e que somente uma função executa por mensagem.
- Confirmar que o modo de teste não envia mensagens nem dispara fluxos.
- Verificar histórico, consumo de IA, erros e comportamento em desktop e celular.
