# Changelog

## 0.1.0

- Node de ação com as 179 operações OpenAPI publicadas em developers.gupy.io, utilizável como ferramenta de AI Agent.
- Credencial com teste `GET /api/v1/jobs` e campos separados para R&S, admissão, admin, user management, clima, educação e pathways.
- Listas pesquisáveis para vaga, candidatura, etapa, departamento, cargo, filial, página de carreira e outros identificadores de R&S que têm endpoint de lista.
- Paginação Return All / Limit / Max Pages, sem devolver lista parcial quando a próxima página ainda existe.
- Retentativa só em leitura, para 429, 502, 504 e falha de rede. Ritmo de 500 requisições por minuto apenas em `api.gupy.io`.
- Gupy Trigger registra e remove webhooks oficiais. Sem HMAC, porque a referência não publica assinatura.
