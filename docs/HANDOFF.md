# Handoff — onde paramos (2026-10-21)

Nota para retomar o trabalho noutra sessão. Fica aqui só o que **não** está em outro lugar:

- regras de trabalho, stack, comandos e estrutura → [`CLAUDE.md`](../CLAUDE.md);
- decisões tomadas (com data e motivo) → [`docs/DECISIONS.md`](DECISIONS.md);
- passos da entrega e status → [`docs/PROGRESS.md`](PROGRESS.md);
- procedimentos de TI (admin, reativar conta, senha esquecida) → [`README.md`](../README.md).

## Onde estamos

- **Entrega 1 (`v0.1`), passos 1 a 9 concluídos.** Próximo: **passo 10 — biblioteca CSV pura** (REQ-IMP-02…14), testada contra `docs/samples/IO_List_csv.csv` (ABB) e `docs/samples/fpt_io_list.csv` (DeltaV) com as expectativas da SPEC §15.
- Fluxo combinado: apresentar o plano do passo, **esperar aprovação**, implementar, rodar lint + typecheck + testes, atualizar `PROGRESS.md`/`DECISIONS.md`, commit por passo. A tag `v0.1` só no fim do passo 14.
- Git: `main`, árvore limpa, último commit `eb4d0da` (passo 9). Nenhuma tag ainda.
- Testes no fechamento do passo 9: 156 unidade/banco (`npm test`) e 20 E2E (`npm run test:e2e`), todos passando.

## Estado do ambiente de dev

- Postgres no Docker (`npm run db:up`), migrações `0000`…`0004` aplicadas no banco `loopcheck`.
- Contas no banco de dev:

  | Conta | Situação |
  |---|---|
  | `admin@admin.com` / `admin123` | único admin (criado com `npm run admin:create`) |
  | `123@gmail.com` | conta de teste do dono do produto, sem admin |
  | `432@gmail.com` | ativa |
  | `321@gmail.com` | removida (desativada) |

- 3 projetos de teste. Ainda não há IO list em nenhum (importação vem nos passos 10–12).

## Pendências e pontos em aberto

- **Lixeira de IO lists** (`Administration → Trash`): combinada para o **passo 13**, junto com `Clear IO list` / `Restore cleared list`. Interpretação registrada: o dono do produto disse "pode fazer o passo 13 agora", entendido como "deixe para o passo 13" (o 13 depende da importação). Confirmar se surgir dúvida.
- **Sem resposta ainda** (oferecido, não decidido):
  - aviso na tela de login: "Forgot your password? Ask your LoopCheck administrator.";
  - lembrete no diálogo de senha temporária para repassá-la por canal privado;
  - validade da senha temporária (ex.: 24 h; exigiria coluna nova).
- **Sub-abas de `Project settings`**: o dono do produto disse que pode mudar o layout depois.
- **Entrega 3 — logos**: acervo geral de imagens + favoritos por projeto (ver `DECISIONS.md`), muda a REQ-SET-02.
- **Entrega 2 — texto do issue**: salvar ao sair do campo (ver `DECISIONS.md`).

## Coisas que confundem no dia a dia

- **Avisos esperados no log do dev server**: `Could not validate instant…` com `NEXT_REDIRECT` (login, troca obrigatória de senha) ou `NEXT_HTTP_ERROR_FALLBACK;404`. São diagnósticos do modo dev do Next 16 quando uma página redireciona ou dá 404; não são bugs. Qualquer outro `⨯` no log é para investigar.
- **Erro `Performance.measure: … end cannot be negative`** (Firefox, só dev): bug do React ao medir componentes que redirecionam. Os links do app já evitam o redirect de `/projects/<id>` (usam `projectHref`).
- **Typecheck com erro de `LayoutRoutes`/rotas**: tipos de rota velhos. Rode `npm run typecheck` (regenera os tipos), não `tsc` direto.
- **E2E** sobe o próprio `next dev` na porta 3100, com banco `loopcheck_e2e` e build em `.next-e2e`; roda junto com o `npm run dev`. Contas de teste usam e-mails aleatórios; admins de teste são marcados direto no banco (cadastro nunca vira admin).
- **Nova migração**: depois de `npm run db:generate`, aplicar com `npm run db:migrate` no banco de dev; o banco de testes e o de E2E são recriados sozinhos.
- **Layouts e páginas do Next rodam em paralelo**: toda página nova de área restrita checa acesso por conta própria (`requireSettingsProject`, `requireAdminUser`), não confie só no layout.

## Preferências do dono do produto (além do `CLAUDE.md`)

- Conversa em português; explicar decisões de forma curta e didática.
- Gosta de **cards + filtro** em listas (projetos, membros, usuários) e de usar a **largura toda** da tela.
- Ações destrutivas com o tom vermelho do tema (variante `destructive`).
- Admin é assunto de TI (banco/scripts), não da interface.
