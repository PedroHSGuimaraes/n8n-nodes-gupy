# n8n-nodes-gupy

Node da comunidade n8n para a API Gupy de empresas publicada em [developers.gupy.io](https://developers.gupy.io/). A versão 0.1.0 cobre as 179 operações OpenAPI das páginas de referência: recrutamento e seleção, admissão, admin, gestão de usuários, clima, educação e pathways.

O node de ação pode ser ferramenta de AI Agent. O Gupy Trigger recebe os webhooks oficiais e registra a URL ao ativar o fluxo.

Os rótulos do editor estão em inglês. A documentação deste repositório está em português.

## Instalar

O pacote pede Node.js 24 ou superior.

```bash
npm ci
npm run build
npm test
npm run lint
```

No n8n, com pacotes não verificados habilitados:

```bash
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install n8n-nodes-gupy
```

Reinicie o n8n e procure **Gupy** e **Gupy Trigger**.

## Credencial

Crie **Gupy API**. O teste real é `GET /api/v1/jobs?page=1&perPage=1&fields=id,name` com o Recruitment Token. Os outros tokens só são necessários no produto correspondente. Deixe Base URL vazia para usar os hosts oficiais. Num mock, informe só a origem, sem caminho.

Detalhe de cada campo: [docs/CAMPOS.md](docs/CAMPOS.md).

## Paginação e limite

Listas usam Return All ou Limit. Se Max Pages estourar com página seguinte ainda indicada, a execução falha e a lista incompleta não sai. `perPage` respeita o máximo 100 da [página de paginação](https://developers.gupy.io/reference/pagination).

Em `api.gupy.io` o node segura o ritmo em 500 requisições por minuto por processo, o número do [WAF](https://developers.gupy.io/reference/rate-limiting). Esse número pode mudar sem aviso. Outros hosts não publicam o mesmo limite. Leitura pode repetir 429, 502, 504 e falha de rede. Escrita não repete.

## Trigger

Ative o fluxo com a URL de produção HTTPS. O node chama `POST /webhooks` para cada evento selecionado e `DELETE /webhooks/{id}` ao desativar. A Gupy espera HTTP 200 em até 30 segundos, pode reenviar e não garante ordem. Use o `id` para deduplicar. O node faz isso e responde 200 para duplicata.

Não há assinatura HMAC na referência. Um segredo opcional é enviado e conferido como header `Authorization`.

## Documentos

- [docs/CAMPOS.md](docs/CAMPOS.md) explica o formulário.
- [docs/COBERTURA.md](docs/COBERTURA.md) liga cada página da Gupy à operação e ao teste, inclusive o que ficou ambíguo.
- [SECURITY.md](SECURITY.md) trata dos dados pessoais de candidatos.
- [workflows](workflows) tem exemplos para importar: listar vagas, receber candidatura e usar o node como ferramenta.

## O que ainda depende de um token real

O teste automatizado usa fixtures e não chama a Gupy. Com um token de produção dá para confirmar o teste da credencial, o formato aceito de `postbackUrl`/`postBackUrl`, se os headers `X-RateLimit-*` aparecem além do `WAF: Rate-Limit`, e se os tokens de admissão, admin, clima, educação e pathways batem com o que cada guia descreve.
