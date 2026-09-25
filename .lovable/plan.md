# Imagens na Base de Conhecimento

## Resultado
Cada conteúdo da Base de Conhecimento poderá ter até cinco imagens, cada uma com sua própria descrição. Quando a Resposta Inteligente usar esse conteúdo como fonte, ela enviará a resposta em texto e, em seguida, as imagens vinculadas ao lead.

## Interface
- Adicionar uma área de imagens nos formulários de criação e edição da Base de Conhecimento.
- Aceitar imagens comuns, validar tipo e tamanho e limitar a cinco por conteúdo.
- Mostrar miniatura, descrição editável, progresso de envio e opção de remover.
- Exibir nas listas quantas imagens cada conteúdo possui.

## Dados e segurança
- Criar registros próprios para as imagens, ligados ao conteúdo, workspace e ordem de envio.
- Guardar arquivo, descrição e tipo da imagem com regras de acesso por workspace.
- Usar o armazenamento já existente da Base de Conhecimento e remover arquivos descartados com segurança.

## Resposta Inteligente
- Carregar as imagens apenas das fontes que a IA realmente utilizou na resposta.
- Enviar o texto primeiro e depois até cinco imagens, na ordem cadastrada, usando a descrição como legenda.
- Suportar os canais atuais: Cloud API, Z-API, Evolution, uazapiGO e extensão.
- Registrar no histórico quais imagens foram enviadas e qualquer falha específica, sem duplicar o texto ou avançar silenciosamente.

## Validação
- Testar cadastro, edição, remoção e limite de cinco imagens.
- Testar uma resposta com fonte sem imagem e outra com várias imagens.
- Confirmar que falhas mostram o motivo real e que o fluxo segue o caminho de erro quando o envio não for concluído.
