from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_URL = f"sqlite:///{BASE_DIR / 'chatbot.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def ensure_database_schema() -> None:
    with engine.begin() as connection:
        session_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(sessions)"))
        }

        if "title" not in session_columns:
            connection.execute(text("ALTER TABLE sessions ADD COLUMN title VARCHAR"))

        if "updated_at" not in session_columns:
            connection.execute(
                text("ALTER TABLE sessions ADD COLUMN updated_at DATETIME")
            )
            connection.execute(
                text(
                    "UPDATE sessions SET updated_at = created_at WHERE updated_at IS NULL"
                )
            )
