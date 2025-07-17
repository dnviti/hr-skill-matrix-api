import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from dotenv import load_dotenv

load_dotenv()

# La variabile d'ambiente DATABASE_URL determina quale DB usare.
# Se non è impostata, usa SQLite come default per lo sviluppo.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./skill_matrix_dev.db")

# Argomenti specifici per il motore a seconda del tipo di DB
engine_args = {}
# L'opzione 'check_same_thread' è necessaria solo per SQLite
if DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Funzione di dipendenza per ottenere una sessione di database
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
