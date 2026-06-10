import os
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Carrega variáveis de ambiente
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))

from sipe_sdk import (
    SIPEClient,
    SIPEError,
    SIPEAuthError,
    SIPENotFoundError,
    SIPEHTTPError
)
from sipe_sdk.client import SanitizingFormatter

# Inicializa logger sanitizado
logger = logging.getLogger("fastapi_app")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = SanitizingFormatter("[%(asctime)s] %(levelname)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

app = FastAPI(
    title="SIPE Integration API",
    description="API FastAPI síncrona para integração com o SIPE via HTTP direto",
    version="1.0.0"
)

# Inicializa as variáveis de ambiente padrão do SIPE
base_url = os.getenv("SIPE_BASE_URL", "https://sipe.sejus.ro.gov.br")

def parse_cookie_header(cookie_header: Optional[str]) -> dict:
    """Converte cabeçalho Cookie em dicionário."""
    cookies = {}
    if cookie_header:
        pairs = cookie_header.split(";")
        for pair in pairs:
            if "=" in pair:
                k, v = pair.split("=", 1)
                cookies[k.strip()] = v.strip()
    return cookies

def get_client(cookie_header: Optional[str] = None) -> SIPEClient:
    """
    Retorna uma instância configurada de SIPEClient.
    Se cookies forem passados no cabeçalho Cookie da API, eles têm precedência.
    Caso contrário, o client carrega dos cookies do .env por padrão.
    """
    client = SIPEClient(base_url=base_url)
    
    # Se a requisição contiver cookies no cabeçalho Cookie
    req_cookies = parse_cookie_header(cookie_header)
    if req_cookies:
        client.set_cookies(req_cookies)
        logger.info("Cookies aplicados a partir da requisição HTTP (Header Cookie).")
        
    return client

# Exception Handlers globais

@app.exception_handler(SIPEAuthError)
def auth_error_handler(request, exc: SIPEAuthError):
    logger.error(f"Erro de Autenticação SIPE: {str(exc)}")
    return JSONResponse(
        status_code=401,
        content={"detail": str(exc), "code": "AUTH_ERROR"}
    )

@app.exception_handler(SIPENotFoundError)
def not_found_handler(request, exc: SIPENotFoundError):
    logger.info(f"Registro SIPE não encontrado: {str(exc)}")
    return JSONResponse(
        status_code=404,
        content={"detail": str(exc), "code": "NOT_FOUND"}
    )

@app.exception_handler(SIPEHTTPError)
def http_error_handler(request, exc: SIPEHTTPError):
    logger.error(f"Erro HTTP na comunicação com o SIPE: {str(exc)}")
    return JSONResponse(
        status_code=502,
        content={"detail": str(exc), "code": "BAD_GATEWAY"}
    )

@app.exception_handler(SIPEError)
def generic_sipe_handler(request, exc: SIPEError):
    logger.error(f"Erro interno do SDK SIPE: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "code": "INTERNAL_SDK_ERROR"}
    )

# Endpoints Síncronos

@app.get("/sipe/pesquisar")
def pesquisar(
    termo: str = Query(..., min_length=1, description="Termo de pesquisa (nome, CPF, etc.)"),
    escolha: str = Query("nomeapenado", description="Critério de escolha"),
    cookie: Optional[str] = Header(None, alias="Cookie")
):
    """
    Pesquisa apenados no SIPE por nome ou outro critério.
    Retorna lista contendo id, nome aproximado e url.
    """
    client = get_client(cookie)
    results = client.pesquisar_apenado(termo, escolha=escolha)
    return [r.dict() for r in results]

@app.get("/sipe/apenado/{apenado_id}/informacoes")
def informacoes(
    apenado_id: str,
    cookie: Optional[str] = Header(None, alias="Cookie")
):
    """
    Obtém as informações detalhadas da ficha do apenado a partir do seu ID.
    """
    client = get_client(cookie)
    details = client.informacoes(apenado_id)
    return details.dict()

@app.get("/sipe/ficha-completa")
def ficha_completa(
    termo: str = Query(..., min_length=1, description="Termo a pesquisar (pegará o primeiro resultado)"),
    cookie: Optional[str] = Header(None, alias="Cookie")
):
    """
    Pesquisa o termo, obtém o primeiro resultado e retorna a ficha de informações estruturada.
    """
    client = get_client(cookie)
    details = client.ficha_completa(termo)
    return details.dict()
