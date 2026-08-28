"""Database connection setup.

Uses SQLite for local development - it's a single file on disk, needs zero
setup (no server to install/run), and is plenty fast for this project's
data size (a few thousand Pokemon/moves/items). If we ever need real
concurrent multi-user writes, swap this for Postgres by changing DATABASE_URL.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./pokemon_champions.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
