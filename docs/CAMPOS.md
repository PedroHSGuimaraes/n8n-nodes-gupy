# Campos do node Gupy

Os nomes no editor estão em inglês. Este guia explica, em português, como preencher cada um sem montar JSON.

## Credencial

| Campo | Quando usar | Como a Gupy descreve |
| --- | --- | --- |
| Recruitment Token | R&S e o teste da credencial | Bearer gerado em Setup, Tokens Generation. O teste chama `GET /api/v1/jobs` com `perPage=1` e `fields=id,name`. |
| Admission Token | Produto Admission | Token de `POST /api/v1/auth/token` em `admission.app.gupy.io`. Não é o token de R&S. |
| Admin Token | Produto Admin | Bearer devolvido por `POST https://accounts.api.gupy.io/v1/token`. Esse endpoint é do guia, não uma operação do node. |
| User Management Token | Produto User Management | Bearer. A página diz que só precisa de Bearer; o objeto de esquema não veio na referência. |
| Engagement Token | Clima, `pulses.com.br` | Valor cru do header `Authorization`, sem a palavra Bearer. |
| Education Secret | Educação corporativa | Query `secret`. Não coloque esse valor num fluxo aberto no navegador. |
| Pathways Token | Pathways | Bearer da central de contas. |
| Base URL | Mock ou proxy | Origem, sem caminho, por exemplo `https://127.0.0.1:43143`. Vazio usa o host oficial de cada produto. |

## Ação

1. Escolha o produto. Cada um aponta para o host documentado.
2. Escolha o recurso e a operação. A lista é a das 179 operações publicadas.
3. Preencha os campos obrigatórios que aparecem na hora. Identificadores de vaga, candidatura, etapa, departamento, cargo, filial, página de carreira, vaga avulsa, webhook, usuário, desligamento, etiqueta e modelo de R&S abrem uma lista pesquisável quando a API de listagem existe.
4. O modo **By ID** aceita o identificador quando ele não está na primeira página da busca.
5. **Additional Fields** guarda o que a referência marca como opcional. O que você não adicionar não é enviado.
6. Listas e objetos sem um schema de chaves viram linhas de valor ou pares chave/valor. Não há área de JSON.

A busca da lista pede no máximo 20 itens da primeira página. O filtro usa o parâmetro `name` ou `q` quando a operação de lista o publica. Para o restante, use By ID.

## Paginação

Operações de lista mostram:

- **Return All**: busca todas as páginas.
- **Limit**: para ao atingir a quantidade. Não busca a página seguinte se a página atual já chegou no limite.
- **Max Pages**: se a resposta ainda indica outra página quando esse teto acaba, o node falha e não devolve a lista pela metade.

`perPage` da API pública fica limitado a 100, como na página de paginação. `maxPageSize` usa o máximo do schema, também 100 nas listas de Admin auditadas. Cursores (`pageToken`, `next_cursor`) não têm tamanho de página documentado; o node só avança o token e falha se o token se repetir.

## Trigger

Selecione um ou mais eventos. Na ativação, o node cria um `POST /webhooks` por evento, com a URL de produção, e remove esses registros na desativação.

A URL sai nas chaves `postbackUrl` e `postBackUrl` por causa do conflito de maiúsculas na referência. `clientHeaders` inclui `Content-Type` e, se você preencher Verification Secret, `Authorization` com esse valor exato. A Gupy não documenta HMAC.

`application.pre-hiring-information-filled` pode ser filtrado, mas não é registrado: ele não está no enum de criação.

Entrega é pelo menos uma vez e sem ordem. O `id` repetido responde 200 e não dispara o fluxo de novo.

## O que o agente de IA vê

O node de ação tem `usableAsTool`. O trigger não. Prefira leituras. Criar candidatura, mover etapa, contratar, desligar e apagar alteram dado pessoal e devem passar por uma pessoa.
