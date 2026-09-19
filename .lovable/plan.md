# Configuração da IA Seletora de Fluxo

## Objetivo
Permitir configurar, dentro da Central de IAs, quais fluxos a Seletora pode usar, quando cada fluxo deve ser escolhido e em quais conexões cada IA pode funcionar.

## Implementação
- Adicionar em todas as IAs uma lista de conexões do workspace com seleção múltipla e estado conectado/desconectado.
- Adicionar na IA Seletora uma lista dos fluxos disponíveis, permitindo anexar/remover cada fluxo.
- Exibir para cada fluxo anexado um campo “Quando este fluxo deve ser enviado?”.
- Salvar os vínculos de conexões e fluxos em tabelas próprias, protegidas pelas mesmas permissões administrativas da Central de IAs.
- Fazer a Orquestradora respeitar as conexões permitidas ao recomendar uma IA.
- Manter tudo em modo de teste: nenhuma mensagem ou fluxo será enviado automaticamente nesta etapa.

## Validação
- Confirmar que configurações persistem após recarregar a página.
- Confirmar que cada IA mantém suas próprias conexões.
- Confirmar que a Seletora mantém seus fluxos e descrições individuais.
- Confirmar que o teste da Orquestradora bloqueia IAs fora da conexão da conversa.
