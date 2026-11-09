# Segurança e LGPD

A API da Gupy para empresas devolve e recebe dados pessoais de candidatos e colaboradores. Isso inclui nome, e-mail, telefone, documento de identificação, endereço, data de nascimento e informações de contratação. O exemplo oficial de `candidate.hired` traz esses campos.

## O que este pacote faz

- Envia o token só para o host da operação, no header ou no query documentado.
- Tira o token, e-mails e documentos no formato de CPF das mensagens de erro.
- Não grava token em log próprio.
- Não publica o pacote e não abre webhook de teste em serviço de terceiros.

## O que você precisa fazer

- Guarde a credencial só com quem opera o fluxo. O teste da credencial e as listas pesquisáveis usam o token de verdade.
- Não cole o Education Secret num fluxo executado no navegador. A própria documentação de educação pede para não expor o segredo no front.
- A URL do trigger precisa ser HTTPS público. Não use coletores de requisição que deixem o corpo visível.
- Trate o item de saída do trigger como dado pessoal. Evite gravá-lo em planilha aberta, canal público ou log sem controle de acesso.
- Apagar o workflow no n8n não apaga o candidato na Gupy. Desativar o workflow chama `DELETE /webhooks/{id}` para os webhooks que este node criou.
- Confirme escritas (candidatura, etapa, contratação, desligamento, exclusão) antes de entregar o node a um agente.

## O que a Gupy não documenta

Não há HMAC de webhook. O segredo opcional só compara o header `Authorization` que o próprio node pediu para a Gupy enviar. Isso não prova sozinho que o pacote veio dos IPs oficiais. Os IPs publicados na página de webhooks são:

- 3.225.75.195
- 3.213.125.198
- 3.81.178.137
- 18.235.49.246
- 18.209.132.16
- 34.231.178.88
- 34.237.26.228
- 52.3.10.144
- 54.87.127.240

Se o seu proxy esconde o IP de origem, essa lista não pode ser conferida pelo node. Faça o filtro no firewall.
