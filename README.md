# LoopCheck

Aplicação web interna para registrar **loop checks** de comissionamento de automação industrial (checkout e issues por tag da IO list) e gerar relatórios PDF para assinatura do cliente.

- Especificação: [`docs/SPEC.md`](docs/SPEC.md)
- Progresso das entregas: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- Decisões de implementação: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Rodar em desenvolvimento

Pré-requisitos: Node.js 24 e Docker.

```bash
cp .env.example .env.local     # ajuste SESSION_SECRET (instruções no arquivo)
npm install
npm run db:up                  # Postgres em Docker
npm run db:migrate             # cria/atualiza as tabelas
npm run admin:create -- --email admin@empresa.com --first Nome --last Sobrenome --password '…'
npm run dev                    # http://localhost:3000
```

Testes: `npm test` (unidade + banco) e `npm run test:e2e` (navegador). Lint e tipos: `npm run lint` e `npm run typecheck`.

## Procedimentos de TI

Os comandos abaixo rodam na máquina do servidor, na pasta do projeto, e usam o banco configurado em `DATABASE_URL` (arquivo `.env.local` ou variável de ambiente). Todos ficam registrados no histórico (`audit_log`).

### Criar o administrador

Contas **não** viram administradoras pelo app: nenhum cadastro vira admin, e a tela de administração não promove ninguém. Num banco novo, o primeiro passo depois de `npm run db:migrate` é criar o admin:

```bash
npm run admin:create -- --email admin@empresa.com --first Nome --last Sobrenome --password 'senha-forte'
```

Para tornar admin uma conta **que já existe** (a senha dela não muda):

```bash
npm run admin:create -- --email pessoa@empresa.com
```

Use uma senha forte em produção. A pessoa pode trocá-la depois em `My account → Change password`.

### Tirar o papel de administrador

Feito direto no banco, de propósito:

```bash
docker compose exec db psql -U loopcheck loopcheck \
  -c "UPDATE users SET is_admin = false, updated_at = now() WHERE email = 'pessoa@empresa.com';"
```

Garanta que sobra ao menos um administrador.

### Remover uma conta (pelo app)

Em `Administration → Users`, o botão `Remove user` desativa a conta: a pessoa não entra mais, sai de todos os projetos e os convites pendentes para ela são cancelados. **Nada é apagado:** o nome dela continua no histórico (checkouts, issues, auditoria). Projetos ativos dos quais ela é owner recebem um novo owner, escolhido no mesmo diálogo; projetos dela que já estavam na lixeira ficam lá, sem owner, e pedem um novo owner se forem restaurados.

Contas de administrador não podem ser removidas pela tela: tire antes o papel de admin (acima).

### Reativar uma conta removida

Por exemplo, alguém que saiu da empresa e voltou:

```bash
npm run user:reactivate -- --email pessoa@empresa.com
```

- A conta volta a entrar com a senha antiga. Se a pessoa não lembrar, um admin gera uma senha temporária em `Administration → Users`.
- **Projetos e posse não voltam.** Os owners precisam convidar a pessoa de novo; projetos que ela possuía continuam com os novos owners.
- O e-mail de uma conta removida fica reservado: a pessoa não consegue se cadastrar de novo com ele, por isso a reativação é o caminho.

### Senha esquecida

Não há recuperação por e-mail. A pessoa pede ao administrador, que gera uma senha temporária em `Administration → Users` e a repassa por um canal privado (mensagem direta, telefone). No próximo login, a pessoa é obrigada a definir uma senha nova.
