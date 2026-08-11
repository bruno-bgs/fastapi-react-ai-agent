from datetime import datetime

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(..., min_length=1, max_length=1000)
    agent_mode: str = Field(default="tutor", max_length=30)


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []
    agent_mode: str


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    session_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationDetail(BaseModel):
    session_id: str
    title: str
    messages: list[MessageResponse]


class DocumentResponse(BaseModel):
    id: int
    name: str
    chunk_count: int
    created_at: datetime
