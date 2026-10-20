# Decisões

Registro de decisões de implementação não cobertas (ou ambíguas) na `docs/SPEC.md`.

| Data | Contexto | Decisão |
|---|---|---|
| 2026-10-20 | Next.js 16 vem com `cacheComponents` ligado por padrão e a próxima major o torna obrigatório. | Mantido ligado. **Não** usamos `use cache` para dados de negócio: a concorrência é central e os dados precisam estar sempre frescos. Leituras de sessão ficam atrás de `<Suspense>`. |
| 2026-10-20 | shadcn/ui atual usa Base UI (`@base-ui/react`) e o pacote `cn` (oficial do shadcn) no lugar de Radix e `clsx` + `tailwind-merge`. | Aceito o padrão atual do shadcn. |
| 2026-10-20 | O Vitest 5 exige `@types/node` ≥ 22. | `@types/node@^24`, alinhado ao Node 24 do ambiente de dev. |
| 2026-10-20 | REQ-AUTH-07 (senha temporária força troca) e REQ-AUTH-08 (limite de tentativas) precisam de estado que a §4 não lista. | Coluna `users.must_change_password` e tabela `login_attempts` (o limite fica no banco para sobreviver a reinícios). |
| 2026-10-20 | REQ-IO-03 (`Revision history`) está dentro de IO-01…06 (Entrega 1) e também na Entrega 4. | Lista simples na Entrega 1; resumo detalhado na Entrega 4. |
| 2026-10-20 | A SPEC §4 define todas as tabelas. | Todas são criadas já na primeira migração, inclusive as que só serão usadas em entregas futuras. |
| 2026-10-20 | Logos (REQ-SET-02). | Ficam para a Entrega 3, como a spec permite. |
| 2026-10-20 | Drizzle precisa de um driver Postgres. | `postgres` (postgres.js): suporte a transações e `SET LOCAL` simples, recomendado pelo Drizzle. Colunas em camelCase no TS e `casing: "snake_case"` no banco. |
| 2026-10-20 | Conjuntos fixos de valores na §4 (papel, status, formato de data…). | `pgEnum` no Postgres: o banco recusa valores inválidos. Adicionar um valor exige migração, o que é desejável (regra 10). |
| 2026-10-20 | Regras da spec que o banco consegue garantir sozinho. | Restrições extras no banco, além das listadas na §4: e-mail em minúsculas (users, invitations), convite nunca como `owner`, tag sem espaços nas pontas e não vazia, `io_type` em maiúsculas, `resolved_at`/`resolved_by` juntos, período de relatório com início ≤ fim. |
| 2026-10-20 | `audit_log` é somente-inserção (REQ-AUD-03), exceto a purga do admin. | Trigger no banco recusa `UPDATE` sempre e `DELETE` salvo se a transação fizer `SET LOCAL loopcheck.allow_audit_purge = 'on'` (só a purga fará isso). Proteção mesmo contra bugs na camada de serviço. |
| 2026-10-20 | Faixas (`range_min`/`range_max`) são `numeric`. | Lidas como `number` no TS (`mode: "number"`); precisão de double é suficiente para faixas de instrumentos. |
| 2026-10-20 | `presence.focused_tag_id` aponta para `tags`. | Única FK com `on delete set null`: presença é efêmera. Todas as outras usam `restrict`. |
| 2026-10-20 | Testes precisam do banco real para validar restrições e transações. | Banco separado `loopcheck_test` (criado pelo compose). `npm test` roda os projetos Vitest `unit` e `db`; o `db` recria o schema pelas migrações e só aceita URL terminada em `_test`. Em modo de teste o Next não lê `.env.local`: o padrão é a URL do compose, sobrescrevível por `TEST_DATABASE_URL` em `.env.test.local`. |
