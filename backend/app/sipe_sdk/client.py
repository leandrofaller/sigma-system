import os
import logging
import re
import time
import hashlib
import json
import base64
import urllib.parse
from typing import List, Dict, Union, Optional
from curl_cffi import requests
from curl_cffi.requests.exceptions import HTTPError, RequestException
from bs4 import BeautifulSoup

try:
    import redis
except ImportError:
    redis = None

from .exceptions import (
    SIPEError,
    SIPEAuthError,
    SIPENotFoundError,
    SIPEHTTPError
)
from .models import ApenadoSearchResult, ApenadoDetails
from .parsers import parse_search_results, parse_apenado_details, _check_session_expired

# Configura o logger sanitizado
logger = logging.getLogger("sipe_sdk")

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

if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = SanitizingFormatter("[%(asctime)s] %(levelname)s in %(module)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class MockResponse:
    """Simula requests.Response para hit de cache."""
    def __init__(self, status_code: int, headers: dict, content: bytes, text: str, url: str = ""):
        self.status_code = status_code
        self.headers = headers
        self.content = content
        self.text = text
        self.url = url

    def json(self):
        return json.loads(self.text)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise HTTPError(
                f"HTTP Error {self.status_code}", 
                code=0, 
                response=self
            )


class SIPEClient:
    """SDK de comunicação síncrona persistente com o SIPE burlado por curl_cffi."""

    def __init__(
        self,
        base_url: str = "https://sipe.sejus.ro.gov.br",
        cpf: Optional[str] = None,
        senha: Optional[str] = None,
        perfil: Optional[str] = None,
        unidade: Optional[str] = None,
        redis_url: Optional[str] = None
    ):
        self.base_url = base_url.rstrip("/")
        self.cpf = cpf or os.getenv("SIPE_CPF")
        self.senha = senha or os.getenv("SIPE_SENHA")
        self.perfil = perfil or os.getenv("SIPE_PERFIL", "2")
        self.unidade = unidade or os.getenv("SIPE_UNIDADE", "3")
        
        # Inicializa o Redis de forma opcional
        self.redis_client = None
        redis_url = redis_url or os.getenv("REDIS_URL")
        if redis_url and redis:
            try:
                self.redis_client = redis.Redis.from_url(redis_url, socket_timeout=2.0)
                self.redis_client.ping()
                logger.info("Conexão com Redis ativa e integrada no SIPEClient.")
            except Exception as e:
                logger.warning(f"Aviso: Não foi possível conectar ao Redis ({str(e)}). Executando sem cache.")
                self.redis_client = None
        elif redis_url and not redis:
            logger.warning("Aviso: REDIS_URL configurada mas a biblioteca 'redis' não está instalada.")
        
        # Inicializa a sessão curl_cffi imitando perfeitamente o navegador Chrome real (JA3 TLS Bypass)
        headers = {
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
        }
        
        self.session = requests.Session(impersonate="chrome", headers=headers, timeout=25.0)
        
        # Carrega cookies do ambiente dinamicamente
        env_cookies = {}
        
        # 1. Carrega do SIPE_COOKIES consolidado
        raw_cookies_str = os.getenv("SIPE_COOKIES")
        if raw_cookies_str:
            pairs = raw_cookies_str.split(";")
            for pair in pairs:
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    env_cookies[k.strip()] = v.strip()
                    
        # 2. Varre chaves individuais SIPE_COOKIE_*
        for key, value in os.environ.items():
            if key.startswith("SIPE_COOKIE_"):
                cookie_name = key.replace("SIPE_COOKIE_", "")
                if cookie_name == "LARAVEL_SESSION":
                    cookie_name = "laravel_session_sipe"
                elif cookie_name == "XSRF_TOKEN":
                    cookie_name = "XSRF-TOKEN"
                env_cookies[cookie_name] = value
                
        if env_cookies:
            self.set_cookies(env_cookies)
            logger.info(f"Carregados {len(env_cookies)} cookies de sessão no init.")
        else:
            logger.warning("Nenhum cookie de sessão foi encontrado no ambiente/.env.")

    def set_cookies(self, cookies: Dict[str, str]) -> None:
        """Define ou atualiza os cookies de forma literal e na jarra da sessão do curl_cffi."""
        if not isinstance(cookies, dict):
            raise ValueError("Cookies devem ser passados como um dicionário.")
            
        host = self.base_url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        
        cookie_parts = []
        for k, v in cookies.items():
            decoded_val = urllib.parse.unquote(v)
            if decoded_val.startswith('"') and decoded_val.endswith('"'):
                decoded_val = decoded_val[1:-1]
            cookie_parts.append(f"{k}={decoded_val}")
            
            # Atualiza a jarra de cookies do requests
            self.session.cookies.set(k, decoded_val, domain=host)
            
        # Injeta de forma literal nos headers da sessão (força sobre o WAF F5)
        cookies_str = "; ".join(cookie_parts)
        self.session.headers["Cookie"] = cookies_str
        logger.info("Cookies de sessão atualizados de forma literal no cabeçalho Cookie do SIPEClient.")

    def login(self, cpf: Optional[str] = None, password: Optional[str] = None, perfil: Optional[str] = None, unidade: Optional[str] = None) -> bool:
        """Realiza a autenticação automática no SIPE e seleciona o perfil e unidade."""
        cpf = cpf or self.cpf
        password = password or self.senha
        perfil = perfil or self.perfil
        unidade = unidade or self.unidade

        if not cpf or not password:
            raise SIPEAuthError("CPF ou Senha não fornecidos para login automático.")

        logger.info(f"Iniciando login automático no SIPE com CPF: {cpf}")

        try:
            # 1. GET na raiz para obter o token CSRF da página de login
            res_get = self.session.get(f"{self.base_url}/", timeout=15)
            soup = BeautifulSoup(res_get.text, "lxml")
            
            token_input = soup.find("input", {"name": "_token"})
            if not token_input:
                raise SIPEAuthError("Token CSRF não encontrado na página de login.")
            token = token_input.get("value")

            # 2. POST para /validaLogin
            payload = {
                "_token": token,
                "cpf": cpf,
                "password": password
            }
            
            res_login = self.session.post(
                f"{self.base_url}/validaLogin",
                data=payload,
                timeout=20,
                allow_redirects=True
            )
            
            # Se a resposta não redirecionar para selectRole ou home, temos falha de credenciais
            if "selectRole" not in res_login.url and "home" not in res_login.url:
                soup_err = BeautifulSoup(res_login.text, "lxml")
                danger_alert = soup_err.find(class_="alert-danger")
                error_msg = danger_alert.text.strip() if danger_alert else soup_err.get_text()[:200].strip()
                raise SIPEAuthError(f"Falha de autenticação no SIPE: {error_msg}")

            # Se já foi direto para home, ótimo (usuário com papel único ou persistido)
            if "home" in res_login.url:
                logger.info("Login efetuado com sucesso direto para home.")
                self._update_cookie_header()
                return True

            # 3. Se redirecionou para selectRole, extrai token da página de seleção de papel
            soup_role = BeautifulSoup(res_login.text, "lxml")
            role_token_input = soup_role.find("input", {"name": "_token"})
            if not role_token_input:
                raise SIPEAuthError("Token CSRF de selectRole não encontrado.")
            role_token = role_token_input.get("value")

            # 4. POST para /selectRole para selecionar o perfil e unidade
            role_payload = {
                "_token": role_token,
                "app_role_id": perfil,
                "unidade_id": unidade
            }
            
            res_role = self.session.post(
                f"{self.base_url}/selectRole",
                data=role_payload,
                timeout=20,
                allow_redirects=True
            )

            if "home" not in res_role.url:
                raise SIPEAuthError(f"Falha ao selecionar papel no SIPE. URL final: {res_role.url}")

            logger.info("Login e seleção de papel efetuados com sucesso via HTTP.")
            self._update_cookie_header()
            return True

        except RequestException as e:
            raise SIPEAuthError(f"Falha de rede ao tentar logar no SIPE: {str(e)}") from e

    def _update_cookie_header(self) -> None:
        """Sincroniza os cookies da sessão da jarra requests para o header literal Cookie."""
        cookies_dict = self.session.cookies.get_dict()
        cookie_parts = []
        for k, v in cookies_dict.items():
            cookie_parts.append(f"{k}={v}")
        if cookie_parts:
            self.session.headers["Cookie"] = "; ".join(cookie_parts)
            logger.info("Cabeçalho literal Cookie atualizado a partir da jarra do curl_cffi.")

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        """Helper centralizado com retry exponencial, renovação de sessão e cache Redis opcional."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        
        # 1. Verifica cache Redis para requisições GET
        is_cacheable = (
            method.upper() == "GET" 
            and self.redis_client is not None
            and "validaLogin" not in path
            and "selectRole" not in path
            and path != "/"
            and not path.startswith("selectRole")
        )
        
        cache_key = None
        if is_cacheable:
            serialized_kwargs = json.dumps(kwargs.get("params", {}), sort_keys=True)
            kwargs_hash = hashlib.md5(serialized_kwargs.encode("utf-8")).hexdigest()
            cache_key = f"sipe:cache:get:{path.lstrip('/')}:{kwargs_hash}"
            
            try:
                cached_data = self.redis_client.get(cache_key)
                if cached_data:
                    data = json.loads(cached_data)
                    logger.info(f"Hit de cache no Redis para: {path}")
                    content_bytes = base64.b64decode(data["content_b64"]) if data.get("content_b64") else data["text"].encode("utf-8")
                    return MockResponse(
                        status_code=data["status_code"],
                        headers=data["headers"],
                        content=content_bytes,
                        text=data["text"],
                        url=url
                    )
            except Exception as e:
                logger.warning(f"Erro ao ler cache do Redis: {str(e)}")

        max_network_retries = 3
        backoff_factor = 2.0
        initial_delay = 1.0
        
        session_renewed = False
        
        for attempt in range(1, max_network_retries + 1):
            try:
                # Injeta os cookies literal
                cookie_header = self.session.headers.get("Cookie")
                if cookie_header:
                    if "headers" not in kwargs:
                        kwargs["headers"] = {}
                    kwargs["headers"]["Cookie"] = cookie_header
                
                # Executa a requisição
                response = self.session.request(method, url, **kwargs)
                
                # Verifica se redirecionou para o login (sessão expirada)
                is_expired = False
                if response.url and ("/login" in response.url or response.url.rstrip("/") == self.base_url):
                    is_expired = True
                else:
                    if "text/html" in response.headers.get("Content-Type", ""):
                        if 'name="password"' in response.text and 'name="cpf"' in response.text:
                            is_expired = True
                
                if is_expired:
                    if not session_renewed:
                        logger.info("Detecção de sessão expirada no request. Tentando re-autenticar...")
                        self.login()
                        session_renewed = True
                        continue
                    else:
                        raise SIPEAuthError("Sessão expirada no SIPE e falha ao renovar.")
                
                response.raise_for_status()
                
                # Se for bem-sucedida e cacheável, grava no Redis por 5 minutos (300s)
                if is_cacheable and response.status_code == 200 and cache_key:
                    try:
                        is_binary = "image" in response.headers.get("Content-Type", "") or path.endswith((".jpg", ".jpeg", ".png"))
                        content_b64 = base64.b64encode(response.content).decode("utf-8") if is_binary else None
                        
                        cache_payload = {
                            "status_code": response.status_code,
                            "headers": dict(response.headers),
                            "text": response.text,
                            "content_b64": content_b64
                        }
                        self.redis_client.setex(cache_key, 300, json.dumps(cache_payload))
                        logger.info(f"Gravado em cache no Redis por 5 min: {path}")
                    except Exception as e:
                        logger.warning(f"Erro ao gravar cache no Redis: {str(e)}")
                
                return response
                
            except HTTPError as e:
                status_code = e.response.status_code if e.response else 500
                
                if status_code in (401, 403):
                    if not session_renewed:
                        logger.info(f"Erro HTTP {status_code} recebido. Tentando re-autenticar...")
                        try:
                            self.login()
                            session_renewed = True
                            continue
                        except Exception as login_err:
                            logger.error(f"Falha ao re-autenticar após erro {status_code}: {str(login_err)}")
                            raise SIPEAuthError("Sessão expirada e re-autenticação falhou.") from e
                    else:
                        raise SIPEAuthError("Sessão expirada no SIPE.") from e
                
                if status_code >= 500:
                    if attempt == max_network_retries:
                        raise SIPEHTTPError(f"Erro HTTP do SIPE após retries: {status_code}") from e
                    delay = initial_delay * (backoff_factor ** (attempt - 1))
                    logger.warning(f"Erro HTTP {status_code} no SIPE. Tentativa {attempt}/{max_network_retries}. Retentando em {delay}s...")
                    time.sleep(delay)
                else:
                    raise SIPEHTTPError(f"Erro HTTP do SIPE: {status_code}") from e
                    
            except RequestException as e:
                if attempt == max_network_retries:
                    raise SIPEHTTPError(f"Falha de conexão persistente com o SIPE: {str(e)}") from e
                delay = initial_delay * (backoff_factor ** (attempt - 1))
                logger.warning(f"Falha de rede/conexão no SIPE ({str(e)}). Tentativa {attempt}/{max_network_retries}. Retentando em {delay}s...")
                time.sleep(delay)

    def check_auth(self) -> bool:
        """Acessa /apenados/index para validar a sessão."""
        logger.info("Verificando autenticação no SIPE...")
        try:
            response = self._request("GET", "/apenados/index")
            soup = BeautifulSoup(response.text, "lxml")
            _check_session_expired(soup)
            logger.info("Autenticação válida no SIPE.")
            return True
        except SIPEAuthError:
            raise
        except Exception as e:
            raise SIPEError(f"Erro ao verificar autenticação: {str(e)}") from e

    def pesquisar_apenado(self, termo: str, escolha: str = "nomeapenado") -> List[ApenadoSearchResult]:
        """Pesquisa apenado no SIPE."""
        logger.info(f"Pesquisando apenado com termo: {termo} (escolha: {escolha})")
        params = {"escolha": escolha, "parametro": termo}
        response = self._request("GET", "/apenados/index", params=params)
        results = parse_search_results(response.text, self.base_url)
        logger.info(f"Pesquisa concluída. {len(results)} resultados encontrados.")
        return results

    def informacoes(self, apenado_id: str) -> ApenadoDetails:
        """Obtém ficha de informações do apenado."""
        logger.info(f"Obtendo informações do apenado ID: {apenado_id}")
        try:
            self._request("GET", f"/apenados/{apenado_id}/selecionarOpcao")
        except Exception as select_err:
            logger.warning(f"Aviso ao selecionarOpcao do apenado ID {apenado_id}: {str(select_err)}")

        response = self._request("GET", f"/apenados/{apenado_id}/informacoes")
        details = parse_apenado_details(response.text, apenado_id, self.base_url)
        logger.info(f"Informações obtidas com sucesso para o apenado ID: {apenado_id}")
        return details

    def fotos_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/fotos").text

    def enderecos_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/enderecos").text

    def faccao_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/faccao").text

    def processos_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/incluirProcessos").text

    def alcunhas_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/alcunhas").text

    def profissao_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/profissao").text

    def triagem_html(self, apenado_id: str) -> str:
        return self._request("GET", f"/apenados/{apenado_id}/triagem").text

    def ficha_completa(self, termo: str) -> ApenadoDetails:
        logger.info(f"Obtendo ficha completa para termo: {termo}")
        results = self.pesquisar_apenado(termo)
        if not results:
            raise SIPENotFoundError(f"Nenhum apenado encontrado para o termo '{termo}'.")
        first_apenado = results[0]
        return self.informacoes(first_apenado.id)
