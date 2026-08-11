from fastapi import APIRouter, File, HTTPException, Response, UploadFile

from app.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationSummary,
    DocumentResponse,
)
from app.services.chat_service import (
    delete_conversation,
    delete_document,
    get_chat_response,
    get_conversation_detail,
    get_conversation_summaries,
    get_documents,
    upload_document,
)

router = APIRouter(tags=["chat"])


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations():
    return get_conversation_summaries()


@router.get("/conversations/{session_id}", response_model=ConversationDetail)
def get_conversation(session_id: str):
    conversation = get_conversation_detail(session_id)

    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversa nao encontrada.")

    return conversation


@router.delete("/conversations/{session_id}", status_code=204)
def remove_conversation(session_id: str):
    deleted = delete_conversation(session_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Conversa nao encontrada.")

    return Response(status_code=204)


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents():
    return get_documents()


@router.post("/documents", response_model=DocumentResponse)
async def create_document(file: UploadFile = File(...)):
    content = await file.read()

    try:
        decoded_content = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Use arquivos de texto UTF-8 para esta primeira versao do RAG.",
        ) from exc

    try:
        return upload_document(file.filename or "documento.txt", decoded_content)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/documents/{document_id}", status_code=204)
def remove_document(document_id: int):
    deleted = delete_document(document_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Documento nao encontrado.")

    return Response(status_code=204)


@router.post("/chat", response_model=ChatResponse)
def chat(data: ChatRequest):
    try:
        reply, sources, agent_mode = get_chat_response(
            data.session_id,
            data.message,
            data.agent_mode,
        )
        return ChatResponse(reply=reply, sources=sources, agent_mode=agent_mode)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc
