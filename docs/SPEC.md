# LoopCheck — Especificação funcional e técnica

> **Versão:** 1.0 · **Data:** 2026-10-19 · **Autor do produto:** Julio Bonatti
>
> Este documento é a fonte da verdade para a implementação. Requisitos têm identificadores (`REQ-XXX-NN`) e devem ser citados em commits, testes e no `docs/PROGRESS.md`.
>
> **Regra para o agente:** implemente **uma entrega por vez** (seção 14). Não comece a entrega seguinte sem aprovação explícita. Se algo aqui estiver ambíguo ou contraditório, **pergunte antes de decidir**, e registre a decisão em `docs/DECISIONS.md`. As premissas da seção 16 podem ser revistas pelo dono do produto a qualquer momento.

---

## 1. Visão geral

**Problema.** Loop checks de comissionamento eram registrados num banco Microsoft Access hospedado no Google Drive. Com duas pessoas usando ao mesmo tempo, gravações se sobrescreviam e o progresso de um dia sumia no dia seguinte.

**Solução.** Uma aplicação web interna, multiusuário, com banco de dados de verdade (PostgreSQL), para:
1. importar a IO list de cada projeto a partir de CSV;
2. registrar, tag por tag, o **checkout** (loop OK) e os **issues** (problemas/observações) durante o loop check;
3. permitir **várias pessoas trabalhando ao mesmo tempo**, vendo em tempo quase real o que os outros fazem;
4. gerar **relatórios em PDF** por período, para assinatura do executor e do cliente.

A aplicação **não** define como cada sinal é testado. O método é acordado com cada cliente e cadastrado como texto ("procedimento de teste") por tipo de IO.

**Usuários típicos.** Engenheiros de automação, que operam a aplicação num **notebook**, na sala de controle, enquanto falam por rádio com o instrumentista no campo.

**Idioma.** ✅ **Toda a interface, mensagens, e-mails e PDFs em inglês.** Este documento está em português, mas todo texto visível ao usuário deve ser escrito em inglês. Os rótulos sugeridos aparecem entre crases (ex.: `Checkout`).

---

## 2. Glossário

| Termo | Significado |
|---|---|
| **Tag** | Um ponto da IO list (ex.: `PT-6824`). Unidade básica do loop check. |
| **IO list** | A lista de tags de um projeto, importada de CSV. Cada projeto tem exatamente uma. |
| **Checkout** | A tag passou no teste (executado conforme o procedimento do seu tipo de IO). |
| **Issue** | Problema ou observação sobre uma tag. Sempre tem tipo e texto. Uma tag pode ter vários ao longo do tempo. |
| **Tipo de IO** | AI, AO, DI, DO, RTD etc. Texto livre, normalizado em maiúsculas. |
| **Área / agrupamento principal** | O atributo do projeto usado como "área" (ex.: `Equipment`, `System`). Escolhido por projeto. |
| **Revisão** | Nome dado a cada mudança na IO list (ex.: `Rev A`). Texto livre, não precisa ser único. |
| **Em escopo** | Decisão manual: a tag entra no loop check. Fora de escopo = não conta nas estatísticas. |
| **Situação na lista** | `active` ou `removed`. `removed` = sumiu numa atualização da IO list. Não conta em nada. |
| **Alerta de reteste** | Marca numa tag com checkout cujos campos relevantes mudaram depois do checkout. |

---

## 3. Stack e arquitetura

| Item | Decisão |
|---|---|
| Linguagem | TypeScript em modo `strict` |
| Framework | **Next.js** (versão estável mais recente, App Router), front e back no mesmo projeto. Mutações via Server Actions ou Route Handlers |
| Banco | **PostgreSQL** (versão estável mais recente) |
| ORM / migrações | **Drizzle ORM** + drizzle-kit. Toda mudança de schema passa por migração versionada |
| Validação | **Zod**, inclusive para os atributos dinâmicos (schema gerado em tempo de execução a partir de `project_fields`) |
| UI | **Tailwind CSS** + **shadcn/ui** |
| Tabelas | **TanStack Table** (filtro, ordenação, virtualização se necessário) |
| Dados no cliente | **TanStack Query** (cache + polling) |
| Gráficos | **Recharts** |
| CSV | **Papa Parse** (com detecção de separador) |
| Drag-and-drop | **dnd-kit** |
| Senhas | Hash **argon2id** (`@node-rs/argon2`). Nunca guardar nem logar senha em texto |
| Sessão | Implementação própria: tabela `sessions`, token aleatório em cookie `httpOnly`, `secure` (em produção), `sameSite=lax`; no banco, apenas o hash do token |
| PDF | Página HTML de impressão renderizada por **Chromium headless** (`playwright-core`) no servidor |
| Testes | **Vitest** (regras de negócio e parsing) + **Playwright** (fluxos ponta a ponta, incluindo dois usuários simultâneos) |
| Ambiente de dev | Docker Compose só com o Postgres; Next.js roda local (`npm run dev`) |
| Produção | Docker Compose numa VM Linux (vSphere): `app` (Next.js `standalone` + Chromium), `db` (Postgres com volume), `proxy` (Caddy com HTTPS) |
| Arquivos | Logos e PDFs gerados num diretório de dados (volume Docker, ex.: `/data/uploads`), referenciados no banco pelo caminho |

**Princípios de arquitetura**

- **ARQ-01** Toda mutação passa por uma **camada de serviço** (`src/server/services/...`), que: (1) verifica permissão; (2) valida a entrada com Zod; (3) executa a mudança **e** grava o `audit_log` **na mesma transação**.
- **ARQ-02** Permissões são verificadas **no servidor**. Esconder botões na UI é complemento, não proteção.
- **ARQ-03** Datas e horas são gravadas em UTC (`timestamptz`). A exibição usa o **fuso** e o **formato de data** do projeto.
- **ARQ-04** Concorrência otimista: tabelas mutáveis por vários usuários (`tags`, `issues`) têm a coluna `version`. Toda atualização envia a versão lida; se não bater, o servidor recusa com conflito (ver REQ-RT-04).
- **ARQ-05** **Separação de responsabilidades nos dados da tag:**
  - importação, atualização e edição manual da IO list **nunca** alteram checkout nem issues;
  - a aba Loop Check **só** altera checkout e issues, **nunca** os dados da IO list.

---

## 4. Modelo de dados

> Nomes em inglês, `snake_case` no banco. Toda tabela tem `id` (uuid, exceto onde indicado), `created_at` e `updated_at` quando fizer sentido. FKs com `on delete` coerente com o soft delete (preferir `restrict`; exclusão definitiva só pela purga do admin).

### 4.1 Usuários e acesso

```
users
  id, email (único, guardado em minúsculas), first_name, last_name,
  password_hash, is_admin (bool, default false), created_at, updated_at

sessions
  id, user_id → users, token_hash (único), expires_at, created_at

projects
  id, client_name, code, description (nullable),
  field_start_date (date)            -- "Field activities start date"
  timezone (texto IANA, ex. 'America/Chicago')
  date_format ('YYYY/MM/DD' | 'MM/DD/YYYY', default 'YYYY/MM/DD')
  primary_group_field_key (nullable) -- atributo usado como "Area"
  company_logo_path, client_logo_path (nullable)
  current_revision_id → revisions (nullable)
  last_signer_executor, last_signer_client (nullable)  -- pré-preenchimento do PDF
  deleted_at, deleted_by (nullable)  -- lixeira
  created_by, created_at, updated_at

project_members
  project_id, user_id (PK composta), role ('owner' | 'member' | 'viewer'), added_at
  -- índice único parcial: exatamente 1 'owner' por projeto

invitations
  id, project_id, email (minúsculas), role ('member' | 'viewer'),
  status ('pending' | 'accepted' | 'declined' | 'cancelled'),
  invited_by, created_at, responded_at
  -- no máximo 1 convite 'pending' por (project_id, email)
```

### 4.2 Definição de colunas da IO list

```
project_fields
  id, project_id, key (slug estável, único por projeto), label,
  source ('builtin' | 'attribute'),
  data_type ('text' | 'number' | 'boolean' | 'date'),
  sort_order,
  required (bool), groupable (bool), test_relevant (bool),
  show_in_io_list (bool), show_in_loop_check (bool)
```

- Campos `builtin` são colunas reais da tabela `tags`: `tag`, `description`, `io_type`, `loop`, `pid`, `range_min`, `range_max`, `unit`. Cada projeto nasce com uma linha `builtin` para cada um, o que permite renomear o rótulo, mostrar/esconder e marcar como relevante para teste.
- `tag`, `description` e `io_type` são sempre `required = true` (não editável).
- Campos `attribute` vivem no JSONB `tags.attributes`, indexados por `key`.
- Renomear coluna muda só `label`. Mudar `data_type` exige validar os valores existentes; se algum não converter, a mudança é recusada e o app lista as tags problemáticas.
- Padrão de `test_relevant`: `io_type`, `range_min`, `range_max`, `unit` = true; demais = false.

### 4.3 Tags, issues e revisões

```
tags
  id, project_id,
  tag (texto; comparação case-insensitive e sem espaços nas pontas),
  description, io_type (maiúsculas), loop, pid,
  range_min (numeric), range_max (numeric), unit,
  attributes (jsonb, default {}),
  in_scope (bool, default true), out_of_scope_reason (nullable),
  list_status ('active' | 'removed', default 'active'),
  removed_in_revision_id → revisions (nullable),
  checkout (bool, default false), checkout_at, checkout_by (nullable),
  retest_alert (bool, default false), retest_alert_reason (nullable),
  cleared_in_id → io_list_clears (nullable)   -- soft delete da IO list
  version (int, default 1), created_at, updated_at
  -- índice único parcial: (project_id, lower(tag)) WHERE cleared_in_id IS NULL
  -- índice GIN em attributes

issues
  id, project_id, tag_id → tags,
  issue_type_id → issue_types,
  description (texto não vazio, após trim),
  opened_at, opened_by,
  updated_at, updated_by,             -- "Issue last modified"
  resolved_at, resolved_by, resolution_comment (nullable),
  version (int)

issue_types
  id, project_id, name, sort_order, archived (bool)
  -- criados por padrão em todo projeto novo: Field, Wiring, Logic, Other

issue_presets                          -- comentários recorrentes
  id, project_id, issue_type_id, text, sort_order

test_procedures
  project_id, io_type (PK composta), text, updated_at, updated_by
  -- sempre o texto mais recente; sem histórico

revisions
  id, project_id, name (texto livre, não único),
  kind ('initial_import' | 'csv_update' | 'manual_edit' | 'restore'),
  summary (jsonb: {added, removed, reactivated, changed, unchanged, edited}),
  created_by, created_at

io_list_clears                         -- lixeira de IO lists
  id, project_id, cleared_by, cleared_at,
  previous_revision_id, restored_at (nullable), purged_at (nullable)
```

### 4.4 Importação, relatórios, presença e auditoria

```
import_drafts
  id, project_id, kind ('initial' | 'update'),
  status ('draft' | 'committed' | 'discarded'),
  file_name, delimiter, headers (jsonb), rows (jsonb),
  mapping (jsonb), row_decisions (jsonb), revision_name (nullable),
  created_by, created_at, updated_at
  -- no máximo 1 rascunho 'draft' por projeto

mapping_templates
  project_id (PK), mapping (jsonb: cabeçalho CSV → key do campo), updated_at

reports
  id, project_id, period_start (date), period_end (date),
  group_by_field_key, executor_name, client_rep_name,
  file_path, file_size, generated_by, generated_at

presence
  project_id, user_id (PK composta), focused_tag_id (nullable), last_seen_at

audit_log
  id (bigserial), project_id (nullable), actor_id, at (timestamptz),
  entity_type, entity_id, action, before (jsonb), after (jsonb),
  revision_id (nullable), batch_id (nullable)  -- agrupa operações em massa
```

### 4.5 Regras derivadas (calculadas, não armazenadas)

- **Tag contável** = `list_status = 'active'` **e** `in_scope = true` **e** `cleared_in_id IS NULL`. **Só tags contáveis aparecem em estatísticas, gráficos e relatórios.**
- **Status da tag** (prioridade de cima para baixo):

| Condição | Status (rótulo na UI) |
|---|---|
| checkout = true e tem issue aberto | `OK – open issue` |
| checkout = true | `OK` |
| checkout = false e tem issue aberto | `Open issue` |
| checkout = false, sem issue aberto, já teve issue | `Pending` *(premissa P-01)* |
| checkout = false e nunca teve issue | `Not tested` |

- **Testada** = checkout = true **ou** já teve algum issue (aberto ou resolvido).
- **% OK** = contáveis com checkout ÷ contáveis.
- **% Tested** = contáveis testadas ÷ contáveis.

---

## 5. Usuários, autenticação e papéis

### 5.1 Autenticação

- **REQ-AUTH-01** Cadastro (`Sign up`) com nome, sobrenome, e-mail e senha. Sem confirmação de e-mail e sem regra de complexidade (apenas não vazia).
- **REQ-AUTH-02** Login (`Sign in`) com e-mail (case-insensitive) e senha. Mensagem de erro genérica (`Invalid email or password`).
- **REQ-AUTH-03** Senha guardada só como hash argon2id. Senha nunca aparece em logs, respostas ou `audit_log`.
- **REQ-AUTH-04** Sessão por cookie `httpOnly`, com validade de 14 dias renovada pelo uso (premissa P-02). `Sign out` invalida a sessão no banco.
- **REQ-AUTH-05** O **primeiro usuário cadastrado** no sistema vira admin automaticamente.
- **REQ-AUTH-06** Trocar senha (`Change password`): senha atual, nova e confirmação. Ao trocar, as outras sessões do usuário são encerradas.
- **REQ-AUTH-07** Não existe "esqueci a senha" por e-mail. O admin gera uma **senha temporária** (exibida uma única vez para ele copiar). No próximo login com ela, o usuário é obrigado a definir uma nova.
- **REQ-AUTH-08** Limite simples de tentativas de login (ex.: 10 falhas por e-mail em 15 min → bloqueio temporário). *(premissa P-03)*

### 5.2 Papéis

Papéis **por projeto**: `owner` (exatamente 1), `member` (vários), `viewer` (vários). Papel **global**: `admin`.

### 5.3 Matriz de permissões

| Ação | Owner | Member | Viewer | Admin (global) |
|---|:-:|:-:|:-:|:-:|
| Ver as abas do projeto | ✓ | ✓ | ✓ (somente leitura) | — |
| Checkout / desmarcar checkout | ✓ | ✓ | ✗ | — |
| Abrir, editar e resolver issues | ✓ | ✓ | ✗ | — |
| Importar, atualizar e editar a IO list | ✓ | ✓ | ✗ | — |
| Exportar a IO list (CSV) | ✓ | ✓ | ✓ | — |
| Limpar a IO list / restaurar IO list limpa | ✓ | ✗ | ✗ | — |
| Configurações (campos, tipos de issue, recorrentes, procedimentos, logos, datas, fuso, formato) | ✓ | ✓ | ✗ | — |
| Convidar, mudar papel, remover membros | ✓ | ✗ | ✗ | — |
| Gerar relatório PDF | ✓ | ✓ | ✗ | — |
| Ver gráficos e baixar PDFs já gerados | ✓ | ✓ | ✓ | — |
| Excluir projeto (vai para a lixeira) | ✓ | ✗ | ✗ | — |
| Sair do projeto (`Leave project`) | ✗ (transferir antes) | ✓ | ✓ | — |
| Gerar senha temporária, marcar/desmarcar admin | — | — | — | ✓ |
| Transferir a posse de um projeto | — | — | — | ✓ |
| Restaurar e purgar a lixeira (projetos e IO lists) | — | — | — | ✓ |

- **REQ-PERM-01** Toda ação da matriz é verificada no servidor (ARQ-02). Tentativa sem permissão retorna erro 403 e não grava nada.
- **REQ-PERM-02** Para o viewer, a UI esconde ou desabilita os controles de alteração.
- **REQ-PERM-03** O admin não é automaticamente membro dos projetos. As ações de admin ficam na seção `Administration`.
- **REQ-PERM-04** O admin não pode remover o próprio status de admin se for o único admin.

### 5.4 Convites e membros

- **REQ-MEM-01** Em Configurações → `Members`, o owner convida por e-mail escolhendo o papel (`Member` ou `Viewer`).
- **REQ-MEM-02** O convite aparece em `My account` → `Invitations` do usuário com aquele e-mail, com os botões `Accept` e `Decline`. Ao aceitar, o usuário vira membro com o papel do convite.
- **REQ-MEM-03** Se o e-mail ainda não tem conta, o convite fica pendente e aparece quando alguém se cadastrar com esse e-mail.
- **REQ-MEM-04** O owner vê os convites pendentes e pode cancelá-los. Também pode mudar o papel de membros e removê-los. O histórico feito por pessoas removidas continua com o nome delas.
- **REQ-MEM-05** Um indicador (contador) na barra lateral, em `My account`, mostra quantos convites pendentes o usuário tem.

---

## 6. Projetos e lixeira

- **REQ-PROJ-01** Qualquer usuário cria um projeto (`New project`) com: `Client name`, `Project code`, `Description` (opcional), `Field activities start date` (padrão: hoje), `Time zone` (padrão: fuso do navegador) e `Date format` (padrão: `YYYY/MM/DD`). Quem cria vira owner.
- **REQ-PROJ-02** Ao criar o projeto, o app cria: os `project_fields` builtin, os tipos de issue padrão (`Field`, `Wiring`, `Logic`, `Other`) e nenhum procedimento de teste.
- **REQ-PROJ-03** Excluir projeto (só owner): confirmação digitando o código do projeto. O projeto vai para a **lixeira** (`deleted_at`) e some para todos os membros.
- **REQ-PROJ-04** Na seção `Administration`, o admin lista os projetos na lixeira e pode `Restore` ou `Delete permanently` (apaga tudo do projeto, inclusive arquivos). A exclusão definitiva também exige digitar o código.
- **REQ-PROJ-05** O admin transfere a posse de um projeto para outro usuário (que vira owner; o antigo owner vira member).

---

## 7. Navegação e telas

### 7.1 Estrutura geral

- **REQ-UI-01** Depois do login, há uma **barra lateral** com:
  - `Projects`: lista os projetos do usuário (não excluídos). Clicar num projeto abre direto a aba `Loop Check`. Botão `New project`.
  - `My account`, com contador de convites pendentes.
  - `Sign out`.
- **REQ-UI-02** A página inicial após o login é a lista `Projects` (cliente, código, papel do usuário, % OK, revisão atual).
- **REQ-UI-03** Dentro de um projeto, quatro abas: **`Loop Check`** · **`IO List`** · **`Reports`** · **`Settings`**. O cabeçalho mostra cliente, código e revisão atual.
- **REQ-UI-04** **Alvo: notebook** (largura de 1366 px pra cima). Layout denso e compacto. Tablet e celular estão fora do escopo.
- **REQ-UI-05** Todas as datas exibidas usam o formato e o fuso do projeto. Datas com hora: `YYYY/MM/DD HH:mm` ou `MM/DD/YYYY HH:mm`.

### 7.2 My account

- **REQ-ACC-01** Mostra: nome e e-mail; projetos em que é owner; projetos em que é member ou viewer (com papel); botão `Leave project` (exceto quando é owner).
- **REQ-ACC-02** Seção `Invitations` com os convites pendentes (projeto, cliente, papel, quem convidou, data) e os botões `Accept` / `Decline`.
- **REQ-ACC-03** Formulário `Change password` (REQ-AUTH-06).
- **REQ-ACC-04** Para admins, seção `Administration` com:
  - `Users`: lista de usuários; `Generate temporary password`; marcar/desmarcar admin; `Transfer project ownership`;
  - `Trash`: projetos excluídos e IO lists limpas, com `Restore` e `Delete permanently`.

### 7.3 Aba Loop Check (tela principal de trabalho)

Layout: **tabela à esquerda**, **painel da tag selecionada à direita**, faixa de presença no topo.

```
┌ Online: (JB)(MS)(RK)                                                              ┐
│ Filters: [Area ▾] [Loop …] [IO type ▾] [Status ▾] [Search tag/description…]  ⟳ 3s │
├────────────────────────────────────────────────────────────┬──────────────────────┤
│ ●  Tag      Description    Loop  Area     ☑ Check date  Issue…  Type  Modified   │ PT-6824 · AI         │
│ (MS) IT-6821 P51.1 MOTOR…  6821  LIN Bkp  ☑ 2026/06/06  —                         │ P51.1 DISCHARGE…     │
│ (JB) PT-6824 P51.1 DISCH…  6824  LIN Bkp  ☐             Open loop  Wiring  …      │ [☑ Checkout]         │
│ ...                                                         │ Open issues (1)  [Resolve] │
│                                                             │ New issue: [type▾][text…]  │
│                                                             │ [Presets ▾] [Repeat last] │
│                                                             │ ▸ Resolved issues  ▸ History│
└────────────────────────────────────────────────────────────┴──────────────────────┘
```

- **REQ-LC-01** Colunas fixas: `Tag`, `Description`, `Loop`, `Area` (valor do agrupamento principal do projeto), `Checkout` (checkbox), `Check date`, `Issue description`, `Issue type`, `Issue last modified`. Colunas extras: os campos com `show_in_loop_check = true`.
- **REQ-LC-02** Só aparecem tags com `list_status = 'active'` e não limpas. Tags fora de escopo aparecem só com o filtro `Show out of scope` ligado, esmaecidas e sem permitir checkout.
- **REQ-LC-03** Filtros: `Area` (multisseleção dos valores), `Loop` (texto), `IO type` (multisseleção), `Status` (multisseleção dos status da seção 4.5), busca por tag/descrição e `Retest alert only`. Os filtros ficam na URL (dá para compartilhar o link).
- **REQ-LC-04** **Checkout:**
  - Clicar no checkbox da linha (ou no do painel) marca o checkout e grava `checkout_at` e `checkout_by`.
  - Desmarcar pede confirmação (`Reopen this tag?`) e limpa `checkout_at` e `checkout_by`. As duas ações vão para o `audit_log`.
- **REQ-LC-05** Na coluna `Issue description`, a linha mostra o issue **aberto** mais recente; se houver mais de um, mostra `+N`. Sem issue aberto, mostra `—`.
- **REQ-LC-06** **Novo issue** (painel): `Type` (obrigatório) + `Description` (obrigatório, não vazio após trim). **Não existe checkbox de issue**: um issue só existe se tiver texto.
- **REQ-LC-07** Atalhos para preencher o issue:
  - `Presets`: lista os comentários recorrentes do projeto e preenche tipo + texto;
  - `Repeat last`: preenche com o tipo + texto do **último issue criado pelo usuário atual neste projeto**;
  - autocompletar: ao digitar, sugere textos de issues já usados no projeto.
- **REQ-LC-08** Issues abertos podem ter tipo e texto editados (`Edit`), atualizando `updated_at`/`updated_by` (= `Issue last modified`).
- **REQ-LC-09** **Resolver:** cada issue aberto tem o botão `Resolve`, que abre um modal com um comentário opcional e grava `resolved_at`/`resolved_by`. Issue resolvido é **imutável** e **nunca reabre**: se o problema voltar, abre-se um issue novo.
- **REQ-LC-10** O painel mostra também a lista `Resolved issues` (recolhível) e o `History` da tag (linha do tempo do `audit_log` daquela tag: quem, quando, o quê).
- **REQ-LC-11** **Alerta de reteste:** tags com `retest_alert = true` mostram um ícone de aviso na linha e uma faixa no painel (`Changed after checkout: <campos> — evaluate retest`) com dois botões: `Reopen tag` (desmarca o checkout e limpa o alerta) e `Dismiss` (limpa o alerta, mantém o checkout). Ambos auditados.
- **REQ-LC-12** **Navegação por teclado:**
  - `↑`/`↓` mudam a linha selecionada;
  - `Space` alterna o checkout da linha selecionada (respeitando a confirmação para desmarcar);
  - `I` foca o campo de novo issue;
  - `Ctrl+Enter` salva o issue.

  Depois de marcar checkout ou salvar um issue, a seleção avança para a próxima linha do filtro atual *(premissa P-04)*.
- **REQ-LC-13** O viewer vê a tabela e o painel sem nenhum controle de alteração.
- **REQ-LC-14** Nesta aba **não** se apaga nada nem se editam os dados da IO list (ARQ-05).

### 7.4 Aba IO List

- **REQ-IO-01** Cabeçalho com a revisão atual (nome, data, quem fez) e os botões:
  - IO list vazia: `Import CSV`; se houver uma IO list limpa restaurável, também `Restore cleared list` (owner);
  - IO list existente: `Update from CSV`, `Edit`, `Export CSV` e `Clear IO list` (owner).
- **REQ-IO-02** Tabela com todas as colunas `show_in_io_list = true`, mais `In scope`, `List status`, `Status` e `Checkout`, em modo leitura fora do modo de edição. Filtros por texto, `IO type`, `Area`, e os toggles `Show removed` e `Show out of scope`.
- **REQ-IO-03** Link `Revision history`: lista de revisões (nome, tipo, data, autor, resumo das contagens).
- **REQ-IO-04** **Export CSV** (todos os papéis): uma linha por tag (inclusive removidas e fora de escopo), com todas as colunas da IO list + `In scope`, `Out of scope reason`, `List status`, `Status`, `Checkout`, `Checkout date`, `Checkout by`, `Open issues count`, `Last open issue type`, `Last open issue description`. Separador vírgula, UTF-8 com BOM, datas no formato do projeto. Nome do arquivo: `<code>_IO_List_<revisão>_<data>.csv`.
- **REQ-IO-05** **Clear IO list** (owner): confirmação digitando o código do projeto. Faz soft delete de todas as tags (`cleared_in_id`); os issues ficam presos às tags; `current_revision_id` volta a nulo; o `audit_log` e os PDFs gerados permanecem. O registro vai para a lixeira do admin.
- **REQ-IO-06** **Restore cleared list** (owner): só é permitido enquanto a IO list estiver vazia. Restaura a última IO list limpa e não purgada, com checkouts e issues, e reaponta a revisão atual.
- **REQ-IO-07** **Modo de edição** (`Edit`) — *entrega 4*:
  - a tabela fica editável célula a célula (campos da IO list apenas);
  - `Add tag` cria uma linha nova;
  - `Set out of scope` / `Set in scope` (com motivo obrigatório ao tirar do escopo);
  - as mudanças ficam **pendentes no cliente** até `Finish editing`;
  - `Finish editing` abre o modal: `Keep current revision (<nome>)` ou `New revision`, com nome obrigatório;
  - a gravação é atômica, com checagem de versão por tag; se houver conflito, mostra quais tags mudaram e permite descartar ou reaplicar;
  - `Cancel` descarta tudo;
  - mudar um campo `test_relevant` de uma tag com checkout liga o alerta de reteste (REQ-REV-06);
  - validações iguais às da importação: tag única, campos obrigatórios, tipos de dado.

### 7.5 Aba Reports

- **REQ-REP-01** Topo: seletor `Up to` (data final dos gráficos). O início é sempre a `Field activities start date`. Padrão: hoje.
- **REQ-REP-02** Seletor `Group by`, com os campos `groupable`. Padrão: o agrupamento principal.
- **REQ-REP-03** Cartões com totais: `Total tags`, `Tested`, `% Tested`, `Checked OK`, `% OK`, `Open issues` (todos sobre tags contáveis).
- **REQ-REP-04** Gráfico **% por agrupamento**: barras horizontais por valor do agrupamento, mostrando `% OK` e `% Tested`.
- **REQ-REP-05** Gráfico **tags fechadas por dia**: barras com a contagem de checkouts por dia (data de `checkout_at` no fuso do projeto), do início das atividades até a data `Up to`. Dias sem atividade aparecem como zero.
- **REQ-REP-06** Tabela **Area report** (igual ao relatório do Access): `Area`, `Total tags`, `Tags checked OK`, `Percent OK`, `Tags tested`, `Percent tested`, com linha `TOTAL`.
- **REQ-REP-07** Botão `Generate PDF` (owner/member) → ver seção 11.
- **REQ-REP-08** Lista `Generated reports`: período, quem gerou, quando, assinantes informados e `Download`. Todos os papéis podem baixar.

### 7.6 Aba Settings

Seções (owner e member editam; viewer não vê esta aba):

- **REQ-SET-01** `Project`: cliente, código, descrição, `Field activities start date`, `Time zone`, `Date format`.
- **REQ-SET-02** `Logos`: `Upload company logo` e `Upload client logo` (PNG/JPG/SVG, até 2 MB), com pré-visualização e opção de remover.
- **REQ-SET-03** `Columns`: lista de `project_fields` com rótulo editável, tipo de dado, ordem (arrastar), e os toggles `Required`, `Groupable`, `Test relevant`, `Show in IO List`, `Show in Loop Check`. Seletor do **agrupamento principal** (`Area`). Botão `Add column`.
- **REQ-SET-04** `Issue types`: adicionar, renomear, reordenar e arquivar (tipo arquivado some das opções, mas continua nos issues antigos).
- **REQ-SET-05** `Issue presets`: lista de comentários recorrentes (tipo + texto), adicionar/editar/remover/reordenar.
- **REQ-SET-06** `Test procedures`: um campo de texto por tipo de IO presente na IO list. Grava sempre o texto mais recente, sem histórico.
- **REQ-SET-07** `Members` (só owner edita; member vê a lista): membros e papéis, convites pendentes, botão `Invite by email`.
- **REQ-SET-08** `Danger zone` (só owner): `Delete project`.

---

## 8. Importação inicial da IO list (assistente)

Acessado por `Import CSV` na aba IO List. **Tudo fica em rascunho (`import_drafts`)** até a confirmação final; o rascunho pode ser retomado depois (`Resume import`) ou descartado.

### Etapa 1 — Arquivo

- **REQ-IMP-01** Aceita apenas `.csv`.
- **REQ-IMP-02** Separador **detectado automaticamente** (`,` `;` tab `|`), com campo para corrigir manualmente e reprocessar.
- **REQ-IMP-03** Limpeza automática:
  - remove o BOM;
  - cabeçalhos: troca quebras de linha por espaço e colapsa espaços repetidos;
  - células: trim, e ` ` (espaço não separável) tratado como espaço.

  Célula que sobra vazia = vazio.
- **REQ-IMP-04** Mostra uma prévia (primeiras 20 linhas) e as contagens: linhas, colunas e colunas 100% vazias. Linhas inteiramente vazias, ou com a tag vazia, são descartadas, e a quantidade é informada.

### Etapa 2 — Mapeamento (drag-and-drop)

- **REQ-IMP-05** Área superior: as colunas de destino (builtin + atributos existentes). Área inferior: as colunas do CSV como "fichas" arrastáveis. O usuário arrasta uma ficha para um destino; cada destino aceita no máximo uma coluna.
- **REQ-IMP-06** **Pré-atribuição automática** por similaridade de nome (normalizar: minúsculas, sem pontuação, sem `(hide)`). Dicionário inicial de sinônimos:
  - `tag`: tag, instrument tag, dv tag name, tag name, tagname, tag no
  - `description`: description, service description (automation), service description, desc
  - `io_type`: io type, io_type, signal type
  - `loop`: loop, loop #, loop no, loop number
  - `pid`: p&id, pid, p and id
  - `range_min`: min scale, io low range (4ma), low range, lrv, range min
  - `range_max`: max scale, io high range (20ma), high range, urv, range max
  - `unit`: engineering units, io engineering unit (eu), eu, units, unit

  Atenção: `Type` sozinho (ex.: IT, PT) **não** é tipo de IO. Na dúvida entre candidatas, prefira a que tem mais células preenchidas.
- **REQ-IMP-07** Colunas do CSV com dados e sem destino aparecem como **sugestão de nova coluna** (rótulo = nome original). O usuário pode `Accept`, renomear ou `Ignore`. Também é possível criar uma coluna nova vazia (`Add column`).
- **REQ-IMP-08** Colunas 100% vazias ficam escondidas por padrão (toggle `Show empty columns`).
- **REQ-IMP-09** Nesta etapa o usuário escolhe o **agrupamento principal (`Area`)** entre as colunas mapeadas. O app sugere colunas de texto com poucos valores distintos (≤ 30) como `groupable`.
- **REQ-IMP-10** `tag`, `description` e `io_type` precisam estar mapeados para avançar.

### Etapa 3 — Ajuste das linhas, em lotes

Cada lote abre já agrupado. O usuário pode agir no lote inteiro (`Apply to all`) ou linha a linha, editando células diretamente.

- **REQ-IMP-11** Lote **Duplicated tags** (comparação case-insensitive): para cada grupo, manter uma linha, editar a tag de outra ou excluir.
- **REQ-IMP-12** Lote **Suggested for deletion**: linhas com `io_type` vazio, `-` ou `DELETED`, subagrupadas por motivo (ex.: "72 rows with IO type '-'"). Ações: `Approve deletion` (lote ou linha) ou `Keep` (exige preencher os campos que faltam).
- **REQ-IMP-13** Lote **Missing required data**: linhas sem algum campo `required`. Ações: preencher ou excluir.
- **REQ-IMP-14** Lote **Invalid values**: valores que não convertem para o tipo do campo (ex.: `TBD` num campo numérico). Ações: corrigir, ou deixar vazio (`Set empty`).
- **REQ-IMP-15** Não dá para avançar enquanto houver pendências nos lotes 11, 13 e 14. O lote 12 precisa de uma decisão (aprovar ou manter) para cada linha.

### Etapa 4 — Revisão e confirmação

- **REQ-IMP-16** Resumo: tags a importar, excluídas, editadas, colunas novas. Campo **`Revision name`** (obrigatório, texto livre, ex.: `Rev A`).
- **REQ-IMP-17** `Confirm import` grava tudo **numa única transação**: tags, `project_fields`, `mapping_templates`, revisão (`initial_import`) e `audit_log` (com `batch_id`). Normaliza `io_type` em maiúsculas.
- **REQ-IMP-18** Testes obrigatórios: os dois arquivos de exemplo em `docs/samples/` devem passar pelo assistente completo (ver seção 15).

---

## 9. Atualização da IO list e revisões (entrega 4)

`Update from CSV` reutiliza o assistente, com o mapeamento salvo em `mapping_templates` já aplicado (o usuário pode ajustar).

- **REQ-REV-01** Comparação **pela tag** (case-insensitive, trim), entre o CSV e as tags não limpas do projeto (ativas e removidas).
- **REQ-REV-02** Lotes de diferenças (além dos lotes de validação da seção 8):
  - **New tags**: tags que não existem → entram como `active`, sem checkout;
  - **Removed tags**: tags `active` que não estão no CSV → passam para `removed`, com `removed_in_revision_id`. **Nada é apagado**: o histórico fica, mas a tag some de tudo (ver 4.5);
  - **Reactivated tags**: tags `removed` que voltaram no CSV → voltam para `active`, **com o histórico anterior** (checkout e issues);
  - **Changed tags**: diferença campo a campo (antes → depois) para aprovar por tag ou em lote. Rejeitar uma mudança mantém o valor atual;
  - **Unchanged**: só a contagem.
- **REQ-REV-03** Renomeação de tag **não** é detectada: a antiga vira `removed` e a nova entra como `new`.
- **REQ-REV-04** Colunas do mapeamento ausentes no CSV novo mantêm os valores atuais. Célula presente e vazia conta como mudança para vazio e aparece no lote `Changed`.
- **REQ-REV-05** `Revision name` obrigatório (texto livre, não único). A confirmação grava tudo numa única transação, com revisão `csv_update` e `audit_log` com `batch_id`.
- **REQ-REV-06** **Alerta de reteste:** se uma tag com checkout teve algum campo `test_relevant` alterado (por atualização via CSV ou edição manual), o app liga `retest_alert = true` e preenche `retest_alert_reason` com os campos alterados. O checkout **não** é desmarcado automaticamente (REQ-LC-11).
- **REQ-REV-07** Atualização e edição manual **nunca** mexem em checkout e issues (ARQ-05), exceto pelo alerta de reteste.

---

## 10. Tempo real, presença e concorrência

> Objetivo central do produto: várias pessoas trabalhando ao mesmo tempo, sem perder nada.

- **REQ-RT-01** A aba Loop Check recarrega os dados automaticamente a cada **3 segundos** (polling com TanStack Query; idealmente um endpoint que devolve só o que mudou desde o último carimbo de tempo). As abas IO List e Reports recarregam ao ganhar foco.
- **REQ-RT-02** **Presença:** com a aba Loop Check aberta, o cliente envia um *heartbeat* a cada 5 s com a tag em foco (a linha selecionada). Um usuário é considerado online se o último heartbeat tiver menos de 15 s.
- **REQ-RT-03** **Indicadores de presença:**
  - No topo da aba, círculos com as **iniciais** de cada usuário online no projeto (cor estável por usuário); o `hover` mostra o nome completo.
  - Em cada linha, círculos pequenos com as iniciais de **quem está com o foco naquela linha**, também com `hover` mostrando o nome. O próprio usuário não aparece.
- **REQ-RT-04** **Conflito:** toda mutação em tag ou issue envia a `version` lida. Se mudou, o servidor recusa e a UI mostra `This tag was changed by <name> at <time>. Data refreshed — please review.`, recarregando a linha. Nenhuma gravação sobrescreve silenciosamente a de outra pessoa.
- **REQ-RT-05** Teste E2E obrigatório: dois navegadores, usuários diferentes, na mesma tag. Um marca checkout e o outro vê em até 5 s; os dois tentam editar o mesmo issue e o segundo recebe o aviso de conflito.

---

## 11. Relatório PDF para assinatura (entrega 3)

- **REQ-PDF-01** `Generate PDF` abre um modal com:
  - `Start date` e `End date`. Padrão: início = dia seguinte ao `period_end` do último relatório gerado (ou a `Field activities start date`, se não houver nenhum); fim = hoje no fuso do projeto;
  - `Group by` (padrão: agrupamento principal);
  - `Executor name` e `Client representative name`, obrigatórios, pré-preenchidos com os últimos usados no projeto.
- **REQ-PDF-02** O PDF é gerado no servidor (Chromium headless a partir de uma página HTML de impressão), em tamanho Letter, orientação retrato (tabelas largas podem usar paisagem), **salvo em disco** e registrado em `reports`. Gerar de novo o mesmo período cria um novo registro.
- **REQ-PDF-03** **Cabeçalho** (em todas as páginas): logo da empresa à esquerda e logo do cliente à direita (se houver), título `Loop Check Report`, cliente, código do projeto, revisão atual da IO list, período (`From … To …`) e data/hora de geração. Rodapé com `Page X of Y`.
- **REQ-PDF-04** **Seção 1 — Activities in period** (cada item com a data da modificação):
  - `Tags checked out in period`: tag, descrição, tipo de IO, área, data do checkout, quem marcou. Critério: checkout atual = true e `checkout_at` dentro do período.
  - `Issues opened in period`: tag, tipo de IO, tipo do issue, descrição, data de abertura, quem abriu, status atual.
  - `Issues resolved in period`: tag, tipo do issue, descrição, data de abertura, data de resolução, quem resolveu, comentário de resolução.
- **REQ-PDF-05** **Seção 2 — Cumulative progress (as of end date)**:
  - tabela Area report (REQ-REP-06) até a data final;
  - gráfico % por agrupamento;
  - gráfico de barras de tags fechadas por dia, do início das atividades até a data final.
- **REQ-PDF-06** **Seção 3 — Test procedures**: o texto atual de cada tipo de IO que tenha tags contáveis.
- **REQ-PDF-07** **Seção 4 — Signatures**: dois blocos lado a lado, `Executor` e `Client representative`, com o nome informado, linha de assinatura e campo `Date: ________` em branco.
- **REQ-PDF-08** Só entram tags contáveis (seção 4.5). O PDF usa o formato de data e o fuso do projeto.

---

## 12. Auditoria

- **REQ-AUD-01** Toda mutação registra no `audit_log`: quem, quando, entidade, ação, `before` e `after` (só os campos alterados). Alguns exemplos de ações: `tag.checkout`, `tag.uncheck`, `tag.retest_alert.dismiss`, `issue.open`, `issue.edit`, `issue.resolve`, `iolist.import`, `iolist.update`, `iolist.edit`, `iolist.clear`, `iolist.restore`, `project.create`, `project.update`, `project.delete`, `project.restore`, `project.purge`, `member.invite`, `member.accept`, `member.role_change`, `member.remove`, `settings.*`, `report.generate`, `admin.temp_password`, `admin.transfer_ownership`.
- **REQ-AUD-02** Operações em massa (importação, atualização, edição manual) compartilham um `batch_id` e registram o resumo, além das mudanças por tag.
- **REQ-AUD-03** O `audit_log` é somente-inserção: nenhuma rota altera ou apaga registros (exceto a purga definitiva de projeto feita pelo admin).

---

## 13. Requisitos não funcionais

- **REQ-NF-01** Projetos de até ~3.000 tags devem ter a aba Loop Check utilizável (filtro e rolagem fluidos, polling sem travar a tela).
- **REQ-NF-02** Todas as entradas validadas no servidor com Zod. Proteção contra CSRF nas mutações (Server Actions já cobrem; nos Route Handlers, checar `Origin`).
- **REQ-NF-03** Uploads: validar extensão, tipo MIME e tamanho; nomes de arquivo gerados pelo servidor.
- **REQ-NF-04** Configuração por variáveis de ambiente (`DATABASE_URL`, `DATA_DIR`, `SESSION_SECRET` etc.), com um `.env.example` documentado.
- **REQ-NF-05** `npm run lint`, `npm run typecheck` e `npm test` passando é condição para fechar qualquer entrega.

---

## 14. Entregas

Cada entrega termina com: código na `main`, testes passando, `docs/PROGRESS.md` atualizado (REQs feitos e pendentes), uma demonstração descrita (roteiro de validação) e uma **tag Git** (`v0.1`, `v0.2`…).

### Entrega 1 — Fundação + IO list (`v0.1`)

**Escopo**
- Setup: repositório Next.js + TypeScript, Tailwind + shadcn/ui, Drizzle + migrações, Docker Compose de dev com Postgres, Vitest e Playwright configurados, script de *seed* de desenvolvimento.
- Autenticação e conta: REQ-AUTH-01…08, REQ-ACC-01…04.
- Projetos, membros, convites, lixeira de projetos: REQ-PROJ-01…05, REQ-MEM-01…05, REQ-PERM-01…04.
- Navegação: REQ-UI-01…05; abas criadas (Loop Check e Reports podem mostrar só `Coming soon`).
- Settings completa: REQ-SET-01…08 (logos podem ficar para a entrega 3).
- IO List: REQ-IO-01…06 (sem o modo de edição), importação inicial completa REQ-IMP-01…18.
- Auditoria: REQ-AUD-01…03 para tudo o que existir nesta entrega.

**Validação pelo dono do produto**
1. Criar duas contas; a primeira é admin.
2. Criar um projeto, convidar a segunda conta como member, aceitar o convite.
3. Importar `IO_List_csv.csv` (ABB) e `fpt_io_list.csv` (DeltaV) em dois projetos, passando por todos os lotes.
4. Exportar o CSV, limpar a IO list, restaurar.
5. Excluir um projeto e restaurá-lo pela seção de admin.

### Entrega 2 — Loop Check (`v0.2`)

**Escopo**
- Aba Loop Check completa: REQ-LC-01…14.
- Tempo real, presença e conflito: REQ-RT-01…05.
- Status, testada e métricas da seção 4.5 (com testes unitários).

**Validação**
Duas pessoas, em dois notebooks (ou duas janelas com contas diferentes), fazem um "dia de loop check" no projeto DeltaV: checkouts, issues com presets e `Repeat last`, resolução. Uma vê o trabalho da outra e a presença por linha, e nenhum dado se perde.

### Entrega 3 — Relatórios + produção (`v0.3`)

**Escopo**
- Aba Reports: REQ-REP-01…08.
- PDF: REQ-PDF-01…08; logos (REQ-SET-02) se não feitos antes.
- Permissões de viewer revisadas em todas as telas.
- Produção:
  - `docker-compose.prod.yml` (app + db + Caddy);
  - Dockerfile com Next `standalone` + Chromium;
  - volumes para banco e `DATA_DIR`;
  - script de backup diário (`pg_dump` + `DATA_DIR`, com rotação) para um destino configurável;
  - `docs/DEPLOY.md` com o passo a passo de instalação na VM Linux.

**Validação**
Gerar o PDF de uma semana, conferir as seções e as assinaturas, e subir a aplicação numa VM de teste seguindo o `DEPLOY.md`.

### Entrega 4 — Revisões (`v0.4`)

**Escopo**
- Atualização da IO list: REQ-REV-01…07.
- Modo de edição manual: REQ-IO-07.
- Histórico de revisões: REQ-IO-03.
- Alerta de reteste ponta a ponta: REQ-LC-11 com REQ-REV-06.

**Validação**
Criar uma "Rev B" a partir do CSV DeltaV (adicionar 3 tags, remover 2, mudar o range de 2 tags com checkout), aplicar, conferir os alertas de reteste e confirmar que o histórico das tags e os relatórios antigos continuam íntegros.

---

## 15. Dados de exemplo e testes

- Colocar em `docs/samples/` os dois CSVs reais:
  - `IO_List_csv.csv` (ABB, 159 linhas, 82 colunas, 59 vazias);
  - `fpt_io_list.csv` (DeltaV, 303 linhas, 34 colunas).
- **Expectativas para os testes de importação:**
  - **ABB:**
    - o mapeamento automático acerta `Instrument TAG` → tag, `Service Description (Automation)` → description, `IO Type` → io_type, `P&ID` → pid, `IO High Range (20mA) (HIDE)` → range_max;
    - lote de duplicadas com `SV-316`, `SV-43` e `ZSO-43`;
    - lote de exclusão sugerida com 72 linhas `-`, 6 `DELETED` e 1 vazia;
    - cabeçalhos com quebra de linha limpos.
  - **DeltaV:**
    - mapeamento automático de `DV Tag Name`, `Description`, `IO Type`, `Loop #`, `P&ID`, `Min Scale`, `Max Scale`, `Engineering Units`;
    - `Type` **não** mapeado como io_type;
    - nenhuma duplicada;
    - 303 tags importáveis (DI 101, AI 88, RTD 52, DO 38, AO 24);
    - `Equipment` sugerido como agrupável (5 valores).
- Testes unitários obrigatórios: cálculo de status e métricas (4.5), detecção de separador, normalização de células, sugestão de mapeamento, diff de revisão (entrega 4), sugestão de período do PDF.
- Testes E2E obrigatórios: fluxo de importação, checkout + issue + resolução, concorrência entre dois usuários (REQ-RT-05), permissões do viewer, geração de PDF.

---

## 16. Premissas assumidas (validar com o dono do produto)

| ID | Premissa |
|---|---|
| P-01 | Tag sem checkout, sem issue aberto, mas que já teve issue resolvido, tem status `Pending` (conta como testada) |
| P-02 | Sessão de 14 dias, renovada a cada uso |
| P-03 | Limite de 10 tentativas de login falhas por e-mail em 15 min |
| P-04 | Após marcar checkout ou salvar issue, a seleção avança para a próxima linha |
| P-05 | Comparação de tags case-insensitive (`pt-6824` = `PT-6824`); exibe como foi importada |
| P-06 | Tipos de issue padrão: `Field`, `Wiring`, `Logic`, `Other` |
| P-07 | Viewer pode exportar o CSV da IO list |
| P-08 | PDF em tamanho Letter (padrão EUA) |
| P-09 | Desmarcar checkout pede confirmação |
| P-10 | Atributos sugeridos como agrupáveis: colunas de texto com até 30 valores distintos |

---

## 17. Fora do escopo (futuro)

- Importar **status** (checkouts/issues) via CSV para trabalho offline (registrado como operação em massa no audit).
- Importação direta de `.xlsx`.
- Login corporativo (Microsoft Entra ID), envio de e-mails, recuperação de senha por e-mail.
- Versão para tablet/celular e modo offline.
- Ligação automática de tags renomeadas entre revisões.
- Histórico de versões dos procedimentos de teste.
- WebSocket/SSE no lugar de polling.
