import os
import logging
import base64
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Header, Body
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

_global_client: Optional[SIPEClient] = None

def get_client(cookie_header: Optional[str] = None, unidade_header: Optional[str] = None, perfil_header: Optional[str] = None) -> SIPEClient:
    """
    Retorna uma instância configurada de SIPEClient.
    Se cookies forem passados no cabeçalho Cookie da API, eles têm precedência e
    uma nova instância é criada temporariamente para a requisição.
    Caso contrário, a instância global compartilhada é reutilizada (evitando logins desnecessários).
    """
    global _global_client
    
    # Se a requisição contiver cookies no cabeçalho Cookie
    req_cookies = parse_cookie_header(cookie_header)
    if req_cookies:
        client = SIPEClient(base_url=base_url)
        client.set_cookies(req_cookies)
        logger.info("Cookies aplicados a partir da requisição HTTP (Header Cookie).")
        if perfil_header:
            client.perfil = perfil_header
        if unidade_header:
            client.selecionar_unidade(unidade_header)
        return client
        
    # Reutiliza o cliente global se não foram fornecidos cookies explícitos na chamada
    if _global_client is None:
        _global_client = SIPEClient(base_url=base_url)
        logger.info("Criada nova instância singleton global de SIPEClient.")
            
    if perfil_header or unidade_header:
        p = perfil_header or _global_client.perfil
        u = unidade_header or _global_client.unidade
        _global_client.selecionar_perfil_e_unidade(p, u)
        
    return _global_client

def _serialize_proxy_response(response, path: str) -> Dict[str, Any]:
    content_type = response.headers.get("content-type", "")

    if "image" in content_type or "octet-stream" in content_type or path.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
        encoded = base64.b64encode(response.content).decode("utf-8")
        return {
            "content_type": content_type,
            "is_binary": True,
            "data": f"data:{content_type};base64,{encoded}"
        }

    payload: Dict[str, Any] = {
        "content_type": content_type,
        "is_binary": False,
        "html": response.text,
        "text": response.text,
    }

    if "json" in content_type:
        try:
            payload["json"] = response.json()
        except ValueError:
            pass

    return payload

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
    cookie: Optional[str] = Header(None, alias="Cookie"),
    unidade: Optional[str] = Header(None, alias="X-Sipe-Unidade")
):
    """
    Pesquisa apenados no SIPE por nome ou outro critério.
    Retorna lista contendo id, nome aproximado e url.
    """
    client = get_client(cookie, unidade)
    results = client.pesquisar_apenado(termo, escolha=escolha)
    return [r.dict() for r in results]

@app.get("/sipe/apenado/{apenado_id}/informacoes")
def informacoes(
    apenado_id: str,
    cookie: Optional[str] = Header(None, alias="Cookie"),
    unidade: Optional[str] = Header(None, alias="X-Sipe-Unidade")
):
    """
    Obtém as informações detalhadas da ficha do apenado a partir do seu ID.
    """
    client = get_client(cookie, unidade)
    details = client.informacoes(apenado_id)
    return details.dict()

@app.get("/sipe/ficha-completa")
def ficha_completa(
    termo: str = Query(..., min_length=1, description="Termo a pesquisar (pegará o primeiro resultado)"),
    cookie: Optional[str] = Header(None, alias="Cookie"),
    unidade: Optional[str] = Header(None, alias="X-Sipe-Unidade")
):
    """
    Pesquisa o termo, obtém o primeiro resultado e retorna a ficha de informações estruturada.
    """
    client = get_client(cookie, unidade)
    details = client.ficha_completa(termo)
    return details.dict()

@app.get("/sipe/proxy")
def sipe_proxy(
    path: str = Query(..., description="Caminho relativo da rota do SIPE a ser requisitado"),
    cookie: Optional[str] = Header(None, alias="Cookie"),
    unidade: Optional[str] = Header(None, alias="X-Sipe-Unidade"),
    perfil: Optional[str] = Header(None, alias="X-Sipe-Perfil")
):
    """
    Proxy de requisição GET ao SIPE real para contornar o WAF (F5 BIG-IP).
    Retorna JSON com o HTML ou a imagem convertida em base64.
    """
    client = get_client(cookie, unidade, perfil)
    try:
        response = client._request("GET", path)
        return _serialize_proxy_response(response, path)
            
    except SIPEAuthError as e:
        logger.error(f"Erro de autenticação no proxy para o path {path}: {str(e)}")
        raise HTTPException(status_code=401, detail=str(e))
    except SIPENotFoundError as e:
        logger.info(f"Registro não encontrado no proxy para o path {path}: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Erro no proxy para o path {path}: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Erro de comunicação com o SIPE: {str(e)}")

@app.post("/sipe/proxy")
def sipe_proxy_write(
    payload: Dict[str, Any] = Body(...),
    cookie: Optional[str] = Header(None, alias="Cookie"),
    unidade: Optional[str] = Header(None, alias="X-Sipe-Unidade"),
    perfil: Optional[str] = Header(None, alias="X-Sipe-Perfil")
):
    """
    Proxy genérico GET/POST ao SIPE real para o modo SDK-first.
    Permite DataTables, paginação e formulários sem depender do browser.
    """
    path = str(payload.get("path") or "").strip()
    method = str(payload.get("method") or "GET").upper()

    if not path:
        raise HTTPException(status_code=400, detail="Campo 'path' é obrigatório.")
    if method not in {"GET", "POST"}:
        raise HTTPException(status_code=400, detail="Método não suportado. Use GET ou POST.")

    client = get_client(cookie, unidade, perfil)

    try:
        req_kwargs: Dict[str, Any] = {}
        params = payload.get("params")
        form = payload.get("form")
        headers = payload.get("headers")

        if isinstance(params, dict) and params:
            req_kwargs["params"] = params
        if isinstance(form, dict) and form:
            form_data = []
            for k, v in form.items():
                if isinstance(v, list):
                    for item in v:
                        form_data.append((k, str(item)))
                else:
                    form_data.append((k, str(v)))
            req_kwargs["data"] = form_data
        if isinstance(headers, dict) and headers:
            req_kwargs["headers"] = headers

        response = client._request(method, path, **req_kwargs)
        return _serialize_proxy_response(response, path)
    except SIPEAuthError as e:
        logger.error(f"Erro de autenticação no proxy {method} para o path {path}: {str(e)}")
        raise HTTPException(status_code=401, detail=str(e))
    except SIPENotFoundError as e:
        logger.info(f"Registro não encontrado no proxy {method} para o path {path}: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Erro no proxy {method} para o path {path}: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Erro de comunicação com o SIPE: {str(e)}")

@app.post("/sgp/proxy")
def sgp_proxy_write(
    payload: Dict[str, Any] = Body(...),
    cookie: Optional[str] = Header(None, alias="Cookie")
):
    """
    Proxy genérico para o SGP SEJUS usando curl_cffi para contornar o bloqueio da SETIC.
    """
    path = str(payload.get("path") or "").strip()
    method = str(payload.get("method") or "GET").upper()

    if not path:
        raise HTTPException(status_code=400, detail="Campo 'path' é obrigatório.")
    if method not in {"GET", "POST"}:
        raise HTTPException(status_code=400, detail="Método não suportado. Use GET ou POST.")

    clean_path = path.lstrip('/')
    url = f"https://sgp.sejus.ro.gov.br/{clean_path}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    custom_headers = payload.get("headers")
    if isinstance(custom_headers, dict) and custom_headers:
        for k, v in custom_headers.items():
            if k.lower() not in {"content-length", "host"}:
                headers[k] = str(v)
    if cookie:
        headers["Cookie"] = cookie

    from curl_cffi import requests as curl_requests

    req_kwargs = {
        "headers": headers,
        "impersonate": "chrome",
        "timeout": 20.0,
        "allow_redirects": False
    }

    form = payload.get("form")
    if form:
        form_data = []
        for k, v in form.items():
            if isinstance(v, list):
                for item in v:
                    form_data.append((k, str(item)))
            else:
                form_data.append((k, str(v)))
        req_kwargs["data"] = form_data

    try:
        if method == "POST":
            response = curl_requests.post(url, **req_kwargs)
        else:
            response = curl_requests.get(url, **req_kwargs)

        content_type = response.headers.get("content-type", "")
        
        set_cookies = []
        try:
            for name, value in response.cookies.items():
                set_cookies.append(f"{name}={value}")
        except Exception:
            pass

        # Também verifica se há cookies adicionais no cabeçalho set-cookie
        for k, v in response.headers.items():
            if k.lower() == 'set-cookie':
                set_cookies.append(v.split(';')[0])

        is_binary = "image" in content_type or path.endswith((".jpg", ".jpeg", ".png", ".webp"))
        
        payload_res = {
            "status": response.status_code,
            "content_type": content_type,
            "set_cookies": list(set(set_cookies)),
            "is_binary": is_binary,
            "url": response.url
        }

        if is_binary:
            payload_res["data"] = base64.b64encode(response.content).decode("utf-8")
        else:
            payload_res["html"] = response.text
            payload_res["text"] = response.text
            
        return payload_res

    except Exception as e:
        logger.error(f"Erro no SGP proxy {method} para {url}: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Erro de comunicação com SGP: {str(e)}")

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
