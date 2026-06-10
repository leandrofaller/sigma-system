import logging
import re


class SanitizingFormatter(logging.Formatter):
    """Formatter para logs que remove CPF, cookies, senhas e tokens."""

    CPF_PATTERN = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b")
    SENSITIVE_PATTERN = re.compile(
        r"(?i)\b(cookie|sessionid|token|laravel_session_sipe|xsrf-token|authorization|password|senha|cpf|_token)\b(\s*[:=]\s*|['\"]?\s*[:=]\s*['\"]?)([^;\s&'\"\}]+)"
    )

    def format(self, record: logging.LogRecord) -> str:
        original_msg = super().format(record)
        sanitized = self.CPF_PATTERN.sub("[CPF REDACTED]", original_msg)
        sanitized = self.SENSITIVE_PATTERN.sub(r"\1\2[REDACTED]", sanitized)
        return sanitized
