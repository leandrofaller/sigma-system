import os
import logging
import base64
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

@app.get("/sipe/proxy")
def sipe_proxy(
    path: str = Query(..., description="Caminho relativo da rota do SIPE a ser requisitado"),
    cookie: Optional[str] = Header(None, alias="Cookie")
):
    """
    Proxy de requisição GET ao SIPE real para contornar o WAF (F5 BIG-IP).
    Retorna JSON com o HTML ou a imagem convertida em base64.
    """
    client = get_client(cookie)
    try:
        # Executa a requisição síncrona com curl_cffi
        response = client._request("GET", path)
        content_type = response.headers.get("content-type", "")
        
        # Se for imagem ou binário
        if "image" in content_type or "octet-stream" in content_type or path.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            encoded = base64.b64encode(response.content).decode("utf-8")
            return {
                "content_type": content_type,
                "is_binary": True,
                "data": f"data:{content_type};base64,{encoded}"
            }
        else:
            # Retorna o HTML bruto
            return {
                "content_type": content_type,
                "is_binary": False,
                "html": response.text
            }
            
    except SIPEAuthError as e:
        logger.error(f"Erro de autenticação no proxy para o path {path}: {str(e)}")
        raise HTTPException(status_code=401, detail=str(e))
    except SIPENotFoundError as e:
        logger.info(f"Registro não encontrado no proxy para o path {path}: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Erro no proxy para o path {path}: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Erro de comunicação com o SIPE: {str(e)}")

@app.get("/sipe/diagnose")

def diagnose():
    """
    Rota de diagnóstico para validar se os cookies foram lidos e injetados
    com sucesso no cliente HTTP do SDK.
    """
    client = get_client()
    cookie_header = client.session.headers.get("Cookie", "")

    
    cookies = {}
    if cookie_header:
        pairs = cookie_header.split(";")
        for pair in pairs:
            if "=" in pair:
                k, v = pair.split("=", 1)
                cookies[k.strip()] = v.strip()
                
    laravel = cookies.get("laravel_session_sipe")
    xsrf = cookies.get("XSRF-TOKEN")
    ts0104 = cookies.get("TS01045542")
    ts017b = cookies.get("TS017bbc36")
    ts019f = cookies.get("TS019f2d14")
    
    return {
        "laravel_session_exists": laravel is not None and len(laravel) > 0,
        "laravel_session_length": len(laravel) if laravel else 0,
        "laravel_session_preview": f"{laravel[:6]}...{laravel[-6:]}" if laravel and len(laravel) > 12 else None,
        "xsrf_token_exists": xsrf is not None and len(xsrf) > 0,
        "xsrf_token_length": len(xsrf) if xsrf else 0,
        "xsrf_token_preview": f"{xsrf[:6]}...{xsrf[-6:]}" if xsrf and len(xsrf) > 12 else None,
        "ts01045542_exists": ts0104 is not None and len(ts0104) > 0,
        "ts017bbc36_exists": ts017b is not None and len(ts017b) > 0,
        "ts019f2d14_exists": ts019f is not None and len(ts019f) > 0,
        "total_cookies_loaded": len(cookies),
        "base_url": base_url,
    }


