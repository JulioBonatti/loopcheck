# LoopCheck

Aplicação web interna para registrar **loop checks** de comissionamento de automação industrial (checkout e issues por tag da IO list) e gerar relatórios PDF para assinatura do cliente. Substitui um banco Access no Drive que perdia dados quando duas pessoas usavam ao mesmo tempo: **concorrência segura é o requisito central.**

**Especificação completa: `docs/SPEC.md`.** Leia antes de qualquer tarefa. Requisitos têm IDs `REQ-XXX-NN`.

## Como trabalhar neste projeto

- **Explique as decisões de forma curta e didática** ao apresentar planos e ao terminar tarefas.
- Implemente **uma entrega por vez** (`docs/SPEC.md` §14). No início de cada entrega:
  1. leia a spec;
  2. apresente um plano em passos pequenos e **espere aprovação**;
  3. implemente;
  4. rode lint + typecheck + testes;
  5. atualize `docs/PROGRESS.md`.

  **Nunca** comece a entrega seguinte sem aprovação.
- Spec ambígua ou contraditória: **pergunte**. Decisões tomadas vão em `docs/DECISIONS.md` (data, contexto, decisão).
- Commits pequenos, mensagem em inglês no imperativo, citando os REQs (ex.: `Add checkout toggle (REQ-LC-04)`). Ao fechar uma entrega, crie a tag `v0.N`.
- Não instale plugins ou skills do Claude Code, nem dependências fora da stack da spec, sem perguntar.

## Stack

Next.js (App Router) · TypeScript strict · PostgreSQL · Drizzle ORM · Zod · Tailwind + shadcn/ui · TanStack Table/Query · Recharts · Papa Parse · dnd-kit · argon2id · Playwright (E2E e PDF) · Vitest. Dev: Postgres via `docker compose`; app local com `npm run dev`.

## Regras invioláveis

1. **Interface 100% em inglês** (textos, mensagens, PDF). Código e identificadores em inglês.
2. **Toda mutação passa pela camada de serviço** (`src/server/services/`): checa permissão → valida com Zod → altera **e** grava `audit_log` na **mesma transação**.
3. **Permissões sempre checadas no servidor** (matriz em SPEC §5.3). Esconder botão não é proteção.
4. **Separação de dados da tag:** importação/atualização/edição da IO list **nunca** tocam checkout nem issues; a aba Loop Check **nunca** altera dados da IO list.
5. **Concorrência otimista:** `tags` e `issues` têm `version`. Atualizações sem a versão correta são recusadas com aviso de conflito. Nada sobrescreve em silêncio.
6. **Nada é apagado de verdade** fora da purga do admin: tags removidas viram `removed`, IO list limpa e projeto excluído vão para a lixeira. `audit_log` é somente-inserção.
7. **Estatísticas só contam tags contáveis:** `list_status='active'` e `in_scope=true` e não limpas.
8. Datas em UTC no banco; exibição no **fuso** e **formato** do projeto (`YYYY/MM/DD` ou `MM/DD/YYYY`).
9. Senhas só como hash argon2id; nunca logar senhas, tokens ou hashes.
10. Schema muda só via migração Drizzle versionada.

## Domínio em 30 segundos

- Engenheiro na sala de controle + instrumentista no campo, por rádio. Testa-se tag por tag, filtrando por área/equipamento.
- **Checkout** = tag passou no teste. **Issue** = problema/observação; só existe com texto (não há checkbox de issue); tem tipo (Field, Wiring, Logic…); resolve-se um a um; **resolvido nunca reabre**.
- Status por tag: `Not tested`, `OK`, `OK – open issue`, `Open issue`, `Pending` (SPEC §4.5).
- IO lists variam muito entre projetos (ABB, DeltaV…): campos builtin + atributos em JSONB descritos em `project_fields`. Exemplos reais em `docs/samples/`.

## Comandos

> Preencher conforme forem criados na Entrega 1 (falta `db:seed`).

- `npm run db:up` / `db:down`: Postgres 18 via docker compose (cria também `loopcheck_test`).
- `npm run db:generate`: gera migração a partir de `src/server/db/schema.ts`. SQL manual: `npx drizzle-kit generate --custom --name <nome>`.
- `npm run db:migrate`: aplica as migrações em `DATABASE_URL` (`.env.local`, copiado de `.env.example`).
- `npm run dev` · `npm run lint` · `npm run typecheck`
- `npm test`: Vitest, projetos `unit` e `db`. O `db` recria o schema de `loopcheck_test` a partir das migrações (precisa de `db:up`). Só um: `npx vitest run --project unit`.
- `npm run test:e2e`: Playwright. Sobe o próprio `next dev` na porta 3100, com o banco `loopcheck_e2e` (recriado a cada execução) e a pasta de build `.next-e2e` (roda junto com o `npm run dev`). Na primeira vez no WSL/Linux: `sudo npx playwright install-deps chromium`.

## Estrutura (alvo)

```
docs/SPEC.md  docs/PROGRESS.md  docs/DECISIONS.md  docs/samples/*.csv
src/app/            rotas e páginas (App Router)
src/components/     UI (shadcn/ui em components/ui)
src/server/db/      schema Drizzle, migrações, conexão
src/server/services/ regras de negócio + auditoria (únicas a fazer mutações)
src/lib/            utilidades puras (datas, status, csv, mapeamento) — com testes
tests/              e2e (Playwright)
```
