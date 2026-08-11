from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models
from app.database import Base, engine, ensure_database_schema
from app.routers.chat import router as chat_router
from app.routers.health import router as health_router

Base.metadata.create_all(bind=engine)
ensure_database_schema()

app = FastAPI(
    title="Chatbot API",
    version="0.1.0",
    description="Backend inicial do chatbot com FastAPI.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(chat_router)
