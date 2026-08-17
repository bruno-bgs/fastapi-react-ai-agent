# Atelier AI

Projeto full stack de **agente técnico com IA** construído com `FastAPI`, `React`, `SQLite` e integração com `Gemini`.

A proposta deste projeto é sair do chatbot genérico e apresentar um produto de portfólio com identidade mais forte: um assistente voltado para tecnologia, com **modos de atuação**, **memória por sessão**, **persistência local** e **RAG com documentos em texto**.

## Visão geral

O sistema é dividido em duas partes principais:

- `backend`: API em `FastAPI` responsável por processar mensagens, consultar o Gemini, recuperar contexto dos documentos e persistir sessões, mensagens e base documental no `SQLite`
- `frontend`: interface em `React + Vite` responsável pela experiência de chat, troca de modo do agente, histórico de conversas e gerenciamento da base RAG

## Funcionalidades atuais

- Conversa com IA usando a API do Gemini
- Modos de atuação do agente:
  - `Tutor`: explica com clareza e foco em aprendizado
  - `Revisor`: analisa código, riscos e melhorias
  - `Arquitetura`: responde com foco em estrutura, escalabilidade e organização técnica
- Histórico salvo em `SQLite`
- Sessões independentes por conversa
- Títulos automáticos para cada conversa
- Sidebar para abrir conversas anteriores
- Exclusão de conversas
- Upload de documentos para a base RAG
- Recuperação de trechos relevantes antes de responder
- Exibição das fontes usadas na resposta
- Suporte a formatação leve nas respostas, como `negrito`, `itálico`, listas curtas e blocos de código
- Envio da mensagem com `Enter`
- Tratamento de erros no backend e no frontend

## Stack

### Backend

- `Python`
- `FastAPI`
- `Uvicorn`
- `SQLAlchemy`
- `SQLite`
- `google-genai`
- `python-dotenv`
- `python-multipart`

### Frontend

- `React`
- `Vite`
- `CSS`

## Estrutura do projeto

```text
chatbot/
  backend/
    app/
      main.py
      config.py
      database.py
      models.py
      schemas.py
      routers/
        chat.py
        health.py
      services/
        chat_service.py
    requirements.txt
    chatbot.db
  frontend/
    src/
      App.jsx
      main.jsx
      styles.css
    package.json
  README.md
```

## Arquitetura

### Backend

- `routers`: definem as rotas HTTP da aplicação
- `services`: concentram a lógica do agente, do RAG e da persistência de conversas
- `models`: definem as tabelas do banco
- `schemas`: definem os contratos de entrada e saída da API
- `database`: configura engine, sessão e ajustes simples de schema

### Frontend

- `App.jsx`: concentra a interface, o envio das mensagens, a troca de modo do agente, o histórico e a base documental
- `styles.css`: define a identidade visual da aplicação

## Como rodar o projeto

### 1. Backend

Entre na pasta:

```powershell
cd backend
```

Instale as dependências:

```powershell
py -m pip install -r requirements.txt
```

Crie um arquivo `.env` dentro de `backend/` com:

```env
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-3.5-flash
```

Inicie a API:

```powershell
py -m uvicorn app.main:app --reload
```

A API ficará disponível em:

- `http://127.0.0.1:8000`
- documentação interativa: `http://127.0.0.1:8000/docs`

### 2. Frontend

Abra outro terminal e entre na pasta:

```powershell
cd frontend
```

Instale as dependências:

```powershell
npm install
```

Rode o projeto:

```powershell
npm run dev
```

O frontend ficará disponível em:

- `http://127.0.0.1:5173`

## Rotas principais

- `GET /health`
- `POST /chat`
- `GET /conversations`
- `GET /conversations/{session_id}`
- `DELETE /conversations/{session_id}`
- `GET /documents`
- `POST /documents`
- `DELETE /documents/{document_id}`

## Fluxo da aplicação

1. O usuário escolhe um modo do agente no frontend.
2. O frontend envia `session_id`, `message` e `agent_mode` para `POST /chat`.
3. O backend salva a mensagem no banco.
4. O service recupera histórico recente da conversa.
5. O RAG busca trechos relevantes na base documental.
6. O backend monta o contexto final e envia ao Gemini.
7. A resposta é salva, devolvida ao frontend e exibida com as fontes recuperadas, quando existirem.

## Exemplo de payload do chat

```json
{
  "session_id": "6f51911d-7d89-4ef5-97dc-dca51cc72f7d",
  "message": "Explique a diferença entre schema e model.",
  "agent_mode": "tutor"
}
```

## Destaques técnicos

- Separação por camadas no backend
- Persistência local com `SQLite`
- Controle de contexto com limite de histórico enviado ao modelo
- Prompt com instruções de comportamento e formatação
- Modos de atuação para diferenciar o papel do agente
- RAG simples com chunking e recuperação lexical
- Base documental administrável pela interface
- Frontend com histórico, exclusão de conversas e visual voltado a portfólio

## Status

Versão funcional de portfólio, com backend e frontend integrados, persistência local, modos de agente e primeira camada de RAG.
