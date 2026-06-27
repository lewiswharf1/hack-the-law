import os
import uuid

from dotenv import load_dotenv
from passlib.context import CryptContext
from sqlalchemy import create_engine, text

load_dotenv()

pwd_ctx = CryptContext(schemes=["bcrypt"])
engine = create_engine(os.environ["DATABASE_URL"])

with engine.connect() as conn:
    conn.execute(
        text("""
            INSERT INTO users (id, username, password_hash)
            VALUES (:id, :username, :hash)
            ON CONFLICT (username) DO NOTHING
        """),
        {"id": str(uuid.uuid4()), "username": "admin", "hash": pwd_ctx.hash("scaffold2026")},
    )
    conn.commit()

print("Seeded: admin / scaffold2026")
