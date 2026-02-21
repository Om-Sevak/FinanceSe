import plaid
from plaid.api import plaid_api as plaid_api_module

from .config import PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV

_ENV_MAP = {
    "sandbox": plaid.Environment.Sandbox,
    "development": plaid.Environment.Development,
    "production": plaid.Environment.Production,
}


def get_plaid_api() -> plaid_api_module.PlaidApi:
    host = _ENV_MAP.get(PLAID_ENV.lower(), plaid.Environment.Sandbox)
    configuration = plaid.Configuration(
        host=host,
        api_key={
            "clientId": PLAID_CLIENT_ID,
            "secret": PLAID_SECRET,
        },
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api_module.PlaidApi(api_client)
