class SIPEError(Exception):
    """Exceção base do SDK do SIPE."""
    pass

class SIPEAuthError(SIPEError):
    """Erro de autenticação ou sessão expirada no SIPE."""
    pass

class SIPENotFoundError(SIPEError):
    """Registro ou apenado não encontrado no SIPE."""
    pass

class SIPEHTTPError(SIPEError):
    """Erro de comunicação HTTP ou de rede com o SIPE."""
    pass
