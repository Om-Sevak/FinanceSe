import os

PLAID_CLIENT_ID: str = os.environ.get("PLAID_CLIENT_ID", "")
PLAID_SECRET: str = os.environ.get("PLAID_SECRET", "")
PLAID_ENV: str = os.environ.get("PLAID_ENV", "sandbox")
PLAID_ENCRYPTION_KEY: str = os.environ.get("PLAID_ENCRYPTION_KEY", "")
