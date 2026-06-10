from .exceptions import (
    SIPEError,
    SIPEAuthError,
    SIPENotFoundError,
    SIPEHTTPError
)
from .models import ApenadoSearchResult, ApenadoDetails
from .logging_utils import SanitizingFormatter

__all__ = [
    "SIPEClient",
    "SIPEError",
    "SIPEAuthError",
    "SIPENotFoundError",
    "SIPEHTTPError",
    "ApenadoSearchResult",
    "ApenadoDetails",
    "SanitizingFormatter",
]


def __getattr__(name):
    if name == "SIPEClient":
        from .client import SIPEClient

        return SIPEClient
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
