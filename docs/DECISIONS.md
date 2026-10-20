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
| 2026-10-20 | Ordem do ARQ-01 e transação. | `mutate` faz tudo numa transação: permissão → Zod → mudança → `audit_log`. Sem permissão o erro é 403 mesmo com entrada inválida (não revela regras de validação). Toda mutação precisa registrar ao menos uma entrada de auditoria, senão é recusada (proteção contra esquecimento). |
| 2026-10-20 | Acesso a projeto de que o usuário não é membro / projeto na lixeira. | Não membro (inclusive admin, REQ-PERM-03) → 403. Projeto inexistente, id malformado ou na lixeira → 404. |
| 2026-10-20 | Matriz de permissões (§5.3). | Fica em `src/lib/permissions.ts` (pura), usada pelo servidor para verificar e pela UI para esconder controles. Ações de admin checam `users.is_admin`. |
| 2026-10-20 | `before`/`after` do audit "só com os campos alterados" (REQ-AUD-01). | `updated_at` e `version` são ignorados; `jsonb` comparado por conteúdo; `password_hash`/`token_hash` viram `[redacted]`. Update sem nenhuma mudança real não gera entrada. |
| 2026-10-20 | REQ-RT-04 pede o nome de quem alterou, mas `tags` não tem `updated_by`. | O nome vem da última entrada do `audit_log` da linha (`entity_type` = `tag`/`issue`); a hora é o `updated_at` da linha. |
| 2026-10-20 | Updates versionados recebem só o id da linha. | Sempre filtram também por `project_id` do projeto autorizado: um member de um projeto não altera tags de outro conhecendo o id. |
| 2026-10-20 | Formato de hora não definido na spec. | 24 horas (`HH:mm`), após a data no formato do projeto. |
| 2026-10-20 | Erros inesperados nos logs. | Mensagem genérica para o usuário; no log do servidor, a cadeia de erros sem os parâmetros de query que o Drizzle anexa (podem conter hashes, regra 9). |
| 2026-10-20 | Sessão (§3, REQ-AUTH-04). | Token de 32 bytes no cookie `loopcheck_session`; no banco só HMAC-SHA256 com `SESSION_SECRET`. Renovação por uso (P-02): no banco, no máximo 1×/dia (ao validar a sessão); o `proxy.ts` renova o `Max-Age` do cookie a cada página, sem tocar no banco. A checagem de verdade é sempre no servidor (layout e actions). |
| 2026-10-20 | Sign out (REQ-AUTH-04) e sessões expiradas. | A linha da sessão é apagada de fato (a regra 6 trata de dados do domínio; sessão é efêmera). Sessões expiradas do usuário são apagadas no login seguinte. |
| 2026-10-20 | Cadastro, login e logout acontecem sem usuário logado, então não passam por `mutate`. | Validam com Zod e gravam o audit na mesma transação mesmo assim (`user.sign_up`, `auth.sign_in`, `auth.sign_out`). Renovação de sessão e registro de tentativas falhas não são auditados (controle interno, não ação do usuário). |
| 2026-10-20 | Primeiro usuário vira admin (REQ-AUTH-05) com cadastros simultâneos. | Cadastro serializado por advisory lock na transação: só um pode ser o primeiro. |
| 2026-10-20 | E-mail já cadastrado no `Sign up`. | `An account with this email already exists.` Revela que o e-mail existe, inevitável num cadastro aberto. No `Sign in` o erro é sempre genérico e, para e-mail inexistente, um hash falso iguala o tempo de resposta. |
| 2026-10-20 | Limite de tentativas (REQ-AUTH-08, P-03). | 10 falhas por e-mail em 15 min bloqueiam aquele e-mail (mesmo com a senha certa) até a janela passar; durante o bloqueio as tentativas não são contadas, e a mensagem diz quantos minutos faltam. Login bem-sucedido zera a contagem. |
| 2026-10-20 | Senha "sem regra, apenas não vazia" (REQ-AUTH-01). | Mantido, com limite de 256 caracteres só para o hash não ficar caro. |
| 2026-10-20 | E2E precisa de banco e não pode sujar o de dev (o primeiro usuário vira admin). | Banco próprio `loopcheck_e2e`, criado e recriado pelas migrações a cada `npm run test:e2e`; o Playwright sempre sobe o próprio servidor (porta 3100) apontando para ele. |
| 2026-10-20 | O Next 16 não aceita dois `next dev` na mesma pasta de build (lock em `.next/dev/lock`). | O E2E usa `distDir` próprio (`.next-e2e`, via `NEXT_DIST_DIR`), então roda mesmo com o `npm run dev` aberto. O Next acrescenta essa pasta ao `include` do `tsconfig.json`; mantido. |
| 2026-10-20 | REQ-UI-01 pede barra lateral; o dono do produto quer a largura toda para a operação. | **Decisão do dono do produto:** sem barra lateral. A navegação (Projects + lista de projetos, My account, Sign out) fica num menu no canto esquerdo do header, aberto por hover, clique ou teclado. O contador de convites (REQ-MEM-05) irá no item `My account` desse menu. |
| 2026-10-20 | REQ-UI-02 lista os projetos. | **Decisão do dono do produto:** cards em grade responsiva (cliente, código, papel, % OK com barra, revisão atual), em vez de tabela. |
| 2026-10-20 | REQ-AUTH-01 não pedia confirmação de senha. | **Decisão do dono do produto:** `Sign up` pede a senha duas vezes (`Confirm password`), como o `Change password`. A troca também recusa nova senha igual à atual. |
| 2026-10-20 | Exibição do % (§4.5). | Inteiro arredondado para baixo (100% só quando tudo terminou); "—" quando não há tags contáveis. |
| 2026-10-20 | `Leave project` e a regra 6 ("nada é apagado"). | A linha de `project_members` é apagada: a regra protege os dados do projeto, não o vínculo. O histórico mantém o nome, pois o `audit_log` aponta para `users`. Auditado como `member.leave`. |
| 2026-10-20 | Troca obrigatória de senha (REQ-AUTH-07). | Centralizada em `requireUser`/`requireActor`: páginas e actions mandam para `/change-password` enquanto `must_change_password` estiver ligado. |
| 2026-10-20 | Leituras (consultas sem mutação). | Ficam em `src/server/queries/`, sempre filtradas pelo usuário logado. Não passam por `mutate`. |
| 2026-10-20 | Cache Components exige `<Suspense>` por segmento para dados por requisição. | Cada rota autenticada tem `loading.tsx` (que é a sua barreira de Suspense). |
