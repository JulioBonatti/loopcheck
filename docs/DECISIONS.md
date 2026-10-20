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
