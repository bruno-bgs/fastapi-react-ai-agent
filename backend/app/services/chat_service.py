from datetime import datetime
import re
from typing import Iterable

from google import genai

from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.database import SessionLocal
from app.models import Document, DocumentChunk, Message, Session

MAX_HISTORY_MESSAGES = 8
MAX_RAG_CHUNKS = 3
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150
AVAILABLE_AGENT_MODES = {"tutor", "reviewer", "architecture"}


def build_session_title(message: str) -> str:
    clean_message = " ".join(message.strip().split())
    if len(clean_message) <= 48:
        return clean_message or "Nova conversa"
    return f"{clean_message[:45].rstrip()}..."


def normalize_agent_mode(agent_mode: str | None) -> str:
    if not agent_mode:
        return "tutor"

    normalized = agent_mode.strip().lower()
    if normalized not in AVAILABLE_AGENT_MODES:
        return "tutor"

    return normalized


def build_agent_instruction(agent_mode: str) -> str:
    if agent_mode == "reviewer":
        return """
        Modo ativo: REVISOR TECNICO.
        Atue como um revisor de codigo e implementacao.
        Priorize bugs, riscos, gargalos, inconsistencias e melhorias concretas.
        Quando fizer sentido, aponte o problema primeiro e depois a melhoria.
        Seja direto, tecnico e util, sem soar agressivo.
        """.strip()

    if agent_mode == "architecture":
        return """
        Modo ativo: ARQUITETO DE SOFTWARE.
        Atue como um agente de arquitetura e evolucao tecnica.
        Priorize estrutura do projeto, organizacao de camadas, escalabilidade,
        manutencao, boas separacoes de responsabilidade e proximos passos reais.
        Responda com senso de produto e engenharia.
        """.strip()

    return """
    Modo ativo: TUTOR TECNICO.
    Atue como um tutor de tecnologia paciente e didatico.
    Ensine com clareza, em passos curtos, ajudando o usuario a entender o motivo
    das decisoes antes de apenas aplicar uma solucao.
    """.strip()


def normalize_tokens(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9_À-ÿ]+", text.lower())


def chunk_text(content: str) -> list[str]:
    clean_content = content.replace("\r\n", "\n").strip()
    if not clean_content:
        return []

    chunks: list[str] = []
    start = 0

    while start < len(clean_content):
        end = min(start + CHUNK_SIZE, len(clean_content))
        chunk = clean_content[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(clean_content):
            break

        start = max(end - CHUNK_OVERLAP, start + 1)

    return chunks


def score_chunk(query_tokens: Iterable[str], chunk_text_value: str) -> int:
    chunk_tokens = set(normalize_tokens(chunk_text_value))
    query_token_set = set(query_tokens)
    return len(query_token_set.intersection(chunk_tokens))


def get_relevant_chunks(message: str) -> list[dict]:
    db = SessionLocal()

    try:
        query_tokens = normalize_tokens(message)
        if not query_tokens:
            return []

        chunks = db.query(DocumentChunk, Document).join(
            Document, Document.id == DocumentChunk.document_id
        ).all()

        ranked_chunks = []
        for chunk, document in chunks:
            score = score_chunk(query_tokens, chunk.content)
            if score > 0:
                ranked_chunks.append(
                    {
                        "document_name": document.name,
                        "content": chunk.content,
                        "score": score,
                    }
                )

        ranked_chunks.sort(key=lambda item: item["score"], reverse=True)
        return ranked_chunks[:MAX_RAG_CHUNKS]
    finally:
        db.close()


def get_documents() -> list[dict]:
    db = SessionLocal()

    try:
        documents = db.query(Document).order_by(Document.created_at.desc()).all()
        return [
            {
                "id": document.id,
                "name": document.name,
                "chunk_count": db.query(DocumentChunk)
                .filter(DocumentChunk.document_id == document.id)
                .count(),
                "created_at": document.created_at,
            }
            for document in documents
        ]
    finally:
        db.close()


def upload_document(filename: str, content: str) -> dict:
    db = SessionLocal()

    try:
        clean_content = content.strip()
        if not clean_content:
            raise RuntimeError("O documento enviado esta vazio.")

        document = Document(name=filename, content=clean_content)
        db.add(document)
        db.commit()
        db.refresh(document)

        chunks = chunk_text(clean_content)
        if not chunks:
            raise RuntimeError("Nao foi possivel gerar chunks para o documento.")

        for index, chunk in enumerate(chunks):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=index,
                    content=chunk,
                )
            )

        db.commit()

        return {
            "id": document.id,
            "name": document.name,
            "chunk_count": len(chunks),
            "created_at": document.created_at,
        }
    finally:
        db.close()


def delete_document(document_id: int) -> bool:
    db = SessionLocal()

    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if document is None:
            return False

        db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
        db.delete(document)
        db.commit()
        return True
    finally:
        db.close()


def get_conversation_summaries() -> list[dict]:
    db = SessionLocal()

    try:
        sessions = (
            db.query(Session)
            .order_by(Session.updated_at.desc(), Session.created_at.desc())
            .all()
        )

        return [
            {
                "session_id": session.id,
                "title": session.title or "Nova conversa",
                "created_at": session.created_at,
                "updated_at": session.updated_at,
            }
            for session in sessions
        ]
    finally:
        db.close()


def get_conversation_detail(session_id: str) -> dict | None:
    db = SessionLocal()

    try:
        session = db.query(Session).filter(Session.id == session_id).first()
        if session is None:
            return None

        messages = (
            db.query(Message)
            .filter(Message.session_id == session_id)
            .order_by(Message.created_at.asc())
            .all()
        )

        return {
            "session_id": session.id,
            "title": session.title or "Nova conversa",
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": message.created_at,
                }
                for message in messages
            ],
        }
    finally:
        db.close()


def delete_conversation(session_id: str) -> bool:
    db = SessionLocal()

    try:
        session = db.query(Session).filter(Session.id == session_id).first()
        if session is None:
            return False

        db.query(Message).filter(Message.session_id == session_id).delete()
        db.delete(session)
        db.commit()
        return True
    finally:
        db.close()


def get_chat_response(
    session_id: str,
    message: str,
    agent_mode: str | None = None,
) -> tuple[str, list[str], str]:
    db = SessionLocal()

    try:
        session = db.query(Session).filter(Session.id == session_id).first()

        if session is None:
            session = Session(id=session_id)
            db.add(session)
            db.commit()

        clean_message = message.strip()

        if not session.title:
            session.title = build_session_title(clean_message)

        session.updated_at = datetime.utcnow()

        user_message = Message(
            session_id=session_id,
            role="user",
            content=clean_message,
        )
        db.add(user_message)
        db.commit()

        if not GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY nao configurada. Crie um arquivo .env no backend com a sua chave."
            )

        client = genai.Client(api_key=GEMINI_API_KEY)

        history = (
            db.query(Message)
            .filter(Message.session_id == session_id)
            .order_by(Message.created_at.desc())
            .limit(MAX_HISTORY_MESSAGES)
            .all()
        )
        history.reverse()

        selected_agent_mode = normalize_agent_mode(agent_mode)
        agent_instruction = build_agent_instruction(selected_agent_mode)
        relevant_chunks = get_relevant_chunks(clean_message)
        source_names = list(dict.fromkeys(chunk["document_name"] for chunk in relevant_chunks))
        rag_context = "\n\n".join(
            f"Fonte: {chunk['document_name']}\nTrecho: {chunk['content']}"
            for chunk in relevant_chunks
        )

        system_prompt = """
        Voce e um assistente de programacao claro, paciente e objetivo.
        Responda sempre em portugues do Brasil.
        Ajude o usuario a entender o que esta fazendo, nao apenas a copiar codigo.
        Explique em etapas curtas e praticas.
        Evite complicar quando uma solucao simples resolver.
        Nao invente informacoes. Se nao souber algo, admita com clareza.
        Mantenha um tom profissional, amigavel e didatico.

        Regras de formato:
        - Use formatacao simples apenas quando realmente ajudar na leitura.
        - Voce pode usar negrito, italico e listas curtas.
        - Nao use titulos grandes, secoes demais ou respostas com cara de artigo.
        - Prefira respostas curtas e bem organizadas.
        - Por padrao, responda em um paragrafo curto ou em no maximo 3 topicos.
        - Nao escreva respostas longas para perguntas introdutorias.
        - Prefira resumir primeiro e aprofundar depois, apenas se o usuario pedir.
        - So use blocos de codigo quando o usuario pedir codigo ou quando forem realmente necessarios.
        - Se o usuario pedir apenas explicacao, responda sem codigo.

        Regras de RAG:
        - Se houver contexto recuperado de documentos, priorize esse contexto.
        - Se o contexto nao for suficiente, diga isso com honestidade.
        - Nao invente conteudo como se ele estivesse nos documentos.
        """.strip()

        history_text = "\n".join(
            f"{item.role}: {item.content}" for item in history
        )

        conversation_context = (
            f"{system_prompt}\n\n"
            f"{agent_instruction}\n\n"
            f"Historico da conversa:\n{history_text}\n\n"
            f"Pergunta atual do usuario:\n{clean_message}\n\n"
            f"Contexto recuperado de documentos:\n{rag_context or 'Nenhum documento relevante encontrado.'}"
        )

        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=conversation_context,
            )
        except Exception as exc:
            error_message = str(exc)

            if "503" in error_message and "UNAVAILABLE" in error_message:
                raise RuntimeError(
                    "O Gemini esta sobrecarregado no momento. Tente novamente em instantes."
                ) from exc

            raise RuntimeError(
                f"Falha ao obter resposta do Gemini: {error_message}"
            ) from exc

        if not response.text:
            raise RuntimeError("O Gemini nao retornou texto na resposta.")

        assistant_reply = response.text.strip()

        assistant_message = Message(
            session_id=session_id,
            role="assistant",
            content=assistant_reply,
        )
        db.add(assistant_message)

        session.updated_at = datetime.utcnow()
        db.commit()

        return assistant_reply, source_names, selected_agent_mode
    finally:
        db.close()
