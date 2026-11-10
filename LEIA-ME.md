# Katechesis

Organização da catequese para paróquias e dioceses. Este repositório contém a **Fase 2 — Fundação**:
login por CPF ou código de acesso, dioceses e paróquias com dados isolados, papéis por vínculo,
log de eventos, backup diário criptografado e o app instalável no celular.

| Pasta | O que tem |
| --- | --- |
| `apps/web` | App (React + TypeScript), instalável no celular |
| `apps/api` | API no Cloudflare Workers (Hono) |
| `packages/compartilhado` | Regras usadas pelos dois lados: CPF, senha, papéis, mensagens |
| `db/migracoes` | Banco (Postgres no Neon): tabelas, regras de isolamento e funções de login |
| `db/scripts` | Migração, criação do administrador, conferência de backup |
| `testes` | Testes do banco, da API e um percurso no navegador |
| `.github/workflows` | Testes, publicação, backup e teste de restauração automáticos |

---

## Publicar pela primeira vez

Faça na ordem. Nenhuma senha, chave ou token deve ser colado em conversa, e-mail ou arquivo do repositório:
eles vão **só** nos segredos do GitHub.

### 1. Enviar o código para o GitHub

1. Instale o [GitHub Desktop](https://desktop.github.com) e entre com a conta **Jair7cr**.
2. *File › Clone repository* › escolha `katechesis` › escolha uma pasta no computador.
3. Descompacte o zip recebido **dentro dessa pasta** (inclusive a pasta oculta `.github`).
4. No GitHub Desktop, escreva um resumo (ex.: "Fase 2 — Fundação"), clique em *Commit to main* e depois em *Push origin*.

O workflow **Publicar** vai rodar e falhar com a mensagem "Rode o workflow Primeira configuração". É esperado: os segredos ainda não existem.

### 2. Neon (banco)

1. No painel do Neon, abra o projeto `katechesis` (região **AWS São Paulo**).
2. Clique em **Connect**. Escolha o papel `neondb_owner`, **desligue** *Connection pooling* e copie a conexão
   (começa com `postgresql://neondb_owner:...`). Ela será o segredo `NEON_URL_DONO`.

> Não crie o papel da API pelo painel do Neon: papéis criados por lá ignoram as regras de isolamento.
> O workflow cria o papel certo sozinho.

### 3. Cloudflare (site, API e backup)

1. **Account ID**: em *Workers & Pages*, copie o *Account ID* (coluna da direita). Segredo `CLOUDFLARE_ACCOUNT_ID`.
2. **Token para publicar**: *My Profile › API Tokens › Create Token* › modelo **Edit Cloudflare Workers** › *Create*. Segredo `CLOUDFLARE_API_TOKEN`.
3. **Bucket de backup**: *R2 › Create bucket* › nome `katechesis-backups`, localização automática. Segredo `R2_BUCKET` = `katechesis-backups`.
   - Em *Settings › Object lifecycle rules*, crie a regra "apagar objetos após **35 dias**".
   - O R2 não tem região no Brasil: o arquivo já sai criptografado do GitHub (ver passo 4).
4. **Chave do bucket**: *R2 › Manage API tokens › Create API token* › permissão **Object Read & Write**, só no bucket `katechesis-backups`.
   Copie o *Access Key ID* (`R2_ACCESS_KEY_ID`) e o *Secret Access Key* (`R2_SECRET_ACCESS_KEY`).

### 4. Senha dos backups

Crie uma frase longa (5 ou mais palavras, ou 30+ caracteres) num gerenciador de senhas. Ela será `BACKUP_SENHA`.
**Guarde uma cópia fora do GitHub**: sem ela, nenhum backup pode ser aberto.

### 5. Segredos no GitHub

No repositório: *Settings › Secrets and variables › Actions › New repository secret*. Cadastre:

| Segredo | De onde vem |
| --- | --- |
| `NEON_URL_DONO` | Passo 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Passo 3.1 |
| `CLOUDFLARE_API_TOKEN` | Passo 3.2 |
| `R2_BUCKET` | `katechesis-backups` |
| `R2_ACCESS_KEY_ID` | Passo 3.4 |
| `R2_SECRET_ACCESS_KEY` | Passo 3.4 |
| `BACKUP_SENHA` | Passo 4 |
| `ADMIN_NOME` | Seu nome completo (pode apagar depois do passo 7) |
| `ADMIN_CPF` | Seu CPF (pode apagar depois do passo 7) |

### 6. Primeira configuração

*Actions › Primeira configuração › Run workflow*. Ele cria as tabelas, o papel da API, publica o sistema e
entrega a conexão do banco ao Worker. No fim do log aparece o endereço, algo como
`https://katechesis.<sua-conta>.workers.dev`.

### 7. Administrador mestre

*Actions › Criar administrador mestre › Run workflow*. A senha provisória aparece no **resumo** da execução.
Entre no Katechesis com seu CPF e essa senha, crie a sua senha e depois **apague a execução**
(menu "…" da execução › *Delete workflow run*). Pode apagar `ADMIN_NOME` e `ADMIN_CPF`.

### 8. Conferir o backup

*Actions › Backup diário › Run workflow* e, quando terminar, *Actions › Teste de restauração › Run workflow*.
Os dois rodam sozinhos depois (backup todo dia às 03:17; teste toda segunda-feira).

A partir daqui, todo *Push* para `main` roda os testes, atualiza o banco e publica.

---

## Critérios de aceite da Fase 2

| Critério | Como conferir |
| --- | --- |
| Entrar com CPF e senha, e sair, no computador e no celular | Tela inicial; *Minha conta › Sair* |
| Entrar com código de acesso sem CPF | Coberto por teste automático; a criação de códigos pela paróquia entra na Fase 3 |
| Senha provisória obriga a troca | Primeiro acesso de qualquer pessoa criada |
| 5 senhas erradas bloqueiam por 15 minutos | Teste automático `testes/banco.test.ts` |
| Admin cria paróquia e coordenador | *Paróquias › Nova paróquia › Pessoas › Adicionar pessoa* |
| Mesma conta com papéis em duas paróquias, com troca | Adicione o mesmo CPF em duas paróquias; troque pelo topo da tela |
| Paróquia A não lê dados da B | Testes `banco.test.ts` e `api.test.ts` (rodam a cada envio) |
| Backup restaurado | Workflow *Teste de restauração* verde |
| App instalado no celular, com a cor da paróquia | No celular: menu do navegador › *Adicionar à tela inicial* |
| Login dentro do limite gratuito de CPU | Cloudflare › Workers › katechesis › *Metrics* › CPU time (medição local: menos de 0,2 ms por requisição, sem contar o banco) |

---

## Como as regras de segurança funcionam

- **Isolamento**: a API usa o papel de banco `katechesis_api`, que não ignora as regras de RLS. Cada requisição
  começa com `app.iniciar(token)`, que valida a sessão; as regras leem o contexto da **sessão gravada no banco**,
  nunca de valores enviados pela API.
- **Senhas**: bcrypt calculado no banco (o Worker não gasta CPU com isso). A API nunca lê o hash.
- **Tokens e chaves**: só o resumo SHA-256 é guardado.
- **Sessão**: cai com 30 minutos sem uso, 12 horas no máximo, ou quando a senha muda. "Manter conectado"
  vale 30 dias e só para catequistas.
- **Log**: nunca guarda CPF completo nem senha.
- **Backups**: criptografados com AES-256 antes de sair do GitHub.

## Desenvolvimento local (opcional)

Precisa de Node 22 e de um Postgres 16+ local.

```bash
npm install
PG_ADMIN_URL=postgres://postgres:senha@localhost:5432/postgres npm test   # testes do banco e da API
npm run construir                                                        # constrói o app
```
