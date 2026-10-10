# API de Catálogo de Livros — Autenticação com JWT

API em Node.js + TypeScript + Express + Prisma (PostgreSQL) com registro/login, hash de senha (bcrypt), JWT e validação com Zod.
Leitura de livros (`GET`) é pública; escrita (`POST`, `PUT`, `DELETE`) exige token.

## Passo a passo

```bash
# 1. Instalar dependências
npm install

# 2. Criar o .env a partir do exemplo e ajustar o JWT_SECRET
cp .env.example .env

# 3. Subir o PostgreSQL (porta 5433)
docker compose up -d

# 4. Aplicar as migrations (cria as tabelas books e users)
npx prisma migrate dev --name create_users

# 5. (Opcional) Popular livros de exemplo
npm run seed

# 6. Rodar a API (http://localhost:3001)
npm run dev

# Visualizar o banco
npx prisma studio
```

## Endpoints

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/register` | Público |
| POST | `/api/auth/login` | Público |
| GET | `/api/auth/me` | Token |
| GET | `/api/books`, `/api/books/:id` | Público |
| POST | `/api/books` | Token |
| PUT | `/api/books/:id` | Token |
| DELETE | `/api/books/:id` | Token |

Rotas protegidas exigem o header `Authorization: Bearer <token>`.

## Exemplos de payloads

**POST /api/auth/register**
```json
{ "email": "wesley@email.com", "password": "123456", "name": "Wesley" }
```
Resposta `201`:
```json
{
  "message": "Usuário registrado com sucesso",
  "token": "<jwt>",
  "user": { "id": 1, "email": "wesley@email.com", "name": "Wesley" }
}
```

**POST /api/auth/login**
```json
{ "email": "wesley@email.com", "password": "123456" }
```

**GET /api/auth/me** — header `Authorization: Bearer <token>`
```json
{ "user": { "id": 1, "email": "wesley@email.com", "name": "Wesley" } }
```

**POST /api/books** — header `Authorization: Bearer <token>`
```json
{ "title": "Dom Casmurro", "author": "Machado de Assis" }
```

## Respostas de erro

| Situação | Status |
|---|---|
| Payload inválido (e-mail malformado, senha < 6 caracteres) | 400 |
| E-mail já cadastrado | 400 |
| E-mail ou senha incorretos | 401 |
| Sem token, formato inválido, token inválido ou expirado | 401 |

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `JWT_SECRET` | Segredo para assinar os tokens |
| `JWT_EXPIRES_IN` | Validade do token (padrão `7d`) |
