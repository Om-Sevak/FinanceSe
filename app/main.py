from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from sqlalchemy import text

from .database import Base, engine
from .routers import accounts, transactions, uploads, categorization, auth, plaid

app = FastAPI(title="Finance Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(uploads.router)
app.include_router(categorization.router)
app.include_router(auth.router)
app.include_router(plaid.router)


def _migrate_db() -> None:
    """Add new columns to existing tables without Alembic."""
    with engine.connect() as conn:
        accounts_cols = [
            row[1] for row in conn.execute(text("PRAGMA table_info(accounts)"))
        ]
        if "plaid_item_id" not in accounts_cols:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN plaid_item_id INTEGER"))
        if "plaid_account_id" not in accounts_cols:
            conn.execute(text("ALTER TABLE accounts ADD COLUMN plaid_account_id TEXT"))

        txn_cols = [
            row[1] for row in conn.execute(text("PRAGMA table_info(transactions)"))
        ]
        if "plaid_transaction_id" not in txn_cols:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN plaid_transaction_id TEXT"))

        conn.commit()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    _migrate_db()


# Serve built frontend (if present)
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(DIST_DIR / "index.html")
