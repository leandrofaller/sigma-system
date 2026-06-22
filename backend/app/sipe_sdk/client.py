import base64
import hashlib
import json
import logging
import os
import threading
import time
import urllib.parse
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

try:
    from curl_cffi import requests
    from curl_cffi.requests.exceptions import HTTPError, RequestException
except ImportError:
    requests = None

    class HTTPError(Exception):
        def __init__(self, *args, response=None, **kwargs):
            super().__init__(*args)
            self.response = response

    class RequestException(Exception):
        pass

try:
    import redis
except ImportError:
    redis = None

from .exceptions import SIPEAuthError, SIPEHTTPError, SIPENotFoundError
from .logging_utils import SanitizingFormatter
from .models import ApenadoDetails, ApenadoSearchResult
from .parsers import _check_session_expired, parse_apenado_details, parse_search_results


logger = logging.getLogger("sipe_sdk")

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
            raise HTTPError(f"HTTP Error {self.status_code}", code=0, response=self)


class _CookieJar:
    def __init__(self):
        self._cookies: Dict[str, str] = {}

    def set(self, key: str, value: str, domain: Optional[str] = None) -> None:
        self._cookies[key] = value

    def get_dict(self) -> Dict[str, str]:
        return dict(self._cookies)

    def clear(self) -> None:
        self._cookies.clear()


class _FallbackSession:
    """Sessao minima para permitir testes sem curl_cffi instalado."""

    def __init__(self, headers: Dict[str, str]):
        self.headers = dict(headers)
        self.cookies = _CookieJar()

    def get(self, *args, **kwargs):
        raise RequestException("curl_cffi nao esta instalado.")

    def post(self, *args, **kwargs):
        raise RequestException("curl_cffi nao esta instalado.")

    def request(self, *args, **kwargs):
        raise RequestException("curl_cffi nao esta instalado.")


class SIPEClient:
    """SDK de comunicacao sincrona persistente com o SIPE via curl_cffi."""

    def __init__(
        self,
        base_url: str = "https://sipe.sejus.ro.gov.br",
        cpf: Optional[str] = None,
        senha: Optional[str] = None,
        perfil: Optional[str] = None,
        unidade: Optional[str] = None,
        redis_url: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.cpf = cpf or os.getenv("SIPE_CPF")
        self.senha = senha or os.getenv("SIPE_SENHA")
        self.perfil = perfil or os.getenv("SIPE_PERFIL", "2")
        self.unidade = unidade or os.getenv("SIPE_UNIDADE", "3")

        self.redis_client = None
        redis_url = redis_url or os.getenv("REDIS_URL")
        if redis_url and redis:
            try:
                self.redis_client = redis.Redis.from_url(redis_url, socket_timeout=2.0)
                self.redis_client.ping()
                logger.info("Conexao com Redis ativa e integrada no SIPEClient.")
            except Exception as exc:
                logger.warning(f"Aviso: nao foi possivel conectar ao Redis ({exc}). Executando sem cache.")
                self.redis_client = None
        elif redis_url and not redis:
            logger.warning("Aviso: REDIS_URL configurada mas a biblioteca 'redis' nao esta instalada.")

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
        self.session = self._create_session(headers)
        # Locks para sincronização entre threads
        self._auth_lock = threading.Lock()
        self._role_lock = threading.Lock()
        self._request_lock = threading.RLock()
        self.perfil_alias = None

        # Tenta carregar cookies persistidos (Redis ou arquivo local JSON)
        persisted_cookies = self._load_persisted_cookies()
        if persisted_cookies:
            self.set_cookies(persisted_cookies)
            logger.info(f"Carregados {len(persisted_cookies)} cookies persistidos no init do SIPEClient.")
        else:
            # Caso contrário, fallback para as variáveis de ambiente/.env
            env_cookies: Dict[str, str] = {}
            raw_cookies_str = os.getenv("SIPE_COOKIES")
            if raw_cookies_str:
                for pair in raw_cookies_str.split(";"):
                    if "=" in pair:
                        key, value = pair.split("=", 1)
                        env_cookies[key.strip()] = value.strip()

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
                logger.info(f"Carregados {len(env_cookies)} cookies de sessao do ambiente no init.")
                # Persiste os cookies do ambiente para uso futuro
                self._persist_cookies()
            else:
                logger.warning("Nenhum cookie de sessao foi encontrado no ambiente/.env ou cache.")

    def _get_cookie_file_path(self) -> str:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "sipe_cookies.json")

    def _persist_cookies(self) -> None:
        """Persiste os cookies atuais no Redis (se ativo) e em um arquivo local JSON."""
        cookies_dict = self.session.cookies.get_dict()
        if not cookies_dict:
            # Tenta extrair os cookies do cabeçalho literal caso a jarra de cookies do curl_cffi esteja vazia
            cookie_header = self.session.headers.get("Cookie", "")
            if cookie_header:
                for pair in cookie_header.split(";"):
                    if "=" in pair:
                        k, v = pair.split("=", 1)
                        cookies_dict[k.strip()] = v.strip()

        if not cookies_dict:
            return

        # 1. Salvar no Redis
        if self.redis_client:
            try:
                self.redis_client.set("sipe:session:cookies", json.dumps(cookies_dict))
                logger.info("Cookies de sessao persistidos com sucesso no Redis.")
            except Exception as e:
                logger.warning(f"Erro ao persistir cookies no Redis: {e}")

        # 2. Salvar em arquivo local JSON
        try:
            file_path = self._get_cookie_file_path()
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(cookies_dict, f, indent=4)
            logger.info(f"Cookies de sessao persistidos com sucesso em arquivo local: {file_path}")
        except Exception as e:
            logger.warning(f"Erro ao persistir cookies em arquivo local: {e}")

    def _load_persisted_cookies(self) -> Optional[Dict[str, str]]:
        """Carrega os cookies de sessão persistidos do Redis ou de arquivo local JSON."""
        # 1. Tentar carregar do Redis
        if self.redis_client:
            try:
                data = self.redis_client.get("sipe:session:cookies")
                if data:
                    logger.info("Cookies de sessao recuperados do Redis.")
                    return json.loads(data)
            except Exception as e:
                logger.warning(f"Erro ao carregar cookies do Redis: {e}")

        # 2. Tentar carregar do arquivo local JSON
        file_path = self._get_cookie_file_path()
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    cookies_dict = json.load(f)
                if cookies_dict:
                    logger.info(f"Cookies de sessao recuperados do arquivo local: {file_path}")
                    return cookies_dict
            except Exception as e:
                logger.warning(f"Erro ao carregar cookies do arquivo local JSON: {e}")

        return None

    def _create_session(self, headers: Dict[str, str]):
        if requests is None:
            logger.warning("curl_cffi nao esta instalado. O cliente operara apenas em modo de teste/mock.")
            return _FallbackSession(headers)
        return requests.Session(impersonate="chrome", headers=headers, timeout=25.0)

    def _build_cache_key(self, path: str, params: Optional[Dict[str, Any]] = None) -> str:
        params_hash = hashlib.md5(
            json.dumps(params or {}, sort_keys=True).encode("utf-8")
        ).hexdigest()
        scope_hash = hashlib.md5(
            json.dumps(
                {
                    "cookie": self.session.headers.get("Cookie", ""),
                    "perfil": self.perfil,
                    "unidade": self.unidade,
                },
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        return f"sipe:cache:get:{path.lstrip('/')}:{scope_hash}:{params_hash}"

    def set_cookies(self, cookies: Dict[str, str]) -> None:
        """Define ou atualiza os cookies de forma literal e na jarra da sessao."""
        if not isinstance(cookies, dict):
            raise ValueError("Cookies devem ser passados como um dicionario.")

        host = self.base_url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        cookie_parts = []
        for key, value in cookies.items():
            decoded_val = urllib.parse.unquote(value)
            if decoded_val.startswith('"') and decoded_val.endswith('"'):
                decoded_val = decoded_val[1:-1]
            cookie_parts.append(f"{key}={decoded_val}")
            self.session.cookies.set(key, decoded_val, domain=host)

        self.session.headers["Cookie"] = "; ".join(cookie_parts)
        logger.debug("Cookies de sessao atualizados de forma literal no cabecalho Cookie do SIPEClient.")

    def login(
        self,
        cpf: Optional[str] = None,
        password: Optional[str] = None,
        perfil: Optional[str] = None,
        unidade: Optional[str] = None,
    ) -> bool:
        """Realiza a autenticacao automatica no SIPE e seleciona perfil e unidade."""
        cpf = cpf or self.cpf
        password = password or self.senha
        perfil_id_original = perfil
        perfil = perfil or self.perfil
        unidade = unidade or self.unidade

        if not cpf or not password:
            raise SIPEAuthError("CPF ou Senha nao fornecidos para login automatico.")

        logger.info(f"Iniciando login automatico no SIPE com CPF: {cpf}")

        # Limpa cookies antigos/expirados e cabecalho Cookie para evitar conflitos de sessao/CSRF
        self.session.headers.pop("Cookie", None)
        try:
            self.session.cookies.clear()
        except AttributeError:
            pass

        try:
            res_get = self.session.get(f"{self.base_url}/", timeout=15)
            soup = BeautifulSoup(res_get.text, "lxml")

            token_input = soup.find("input", {"name": "_token"})
            if not token_input:
                raise SIPEAuthError("Token CSRF nao encontrado na pagina de login.")
            token = token_input.get("value")

            res_login = self.session.post(
                f"{self.base_url}/validaLogin",
                data={"_token": token, "cpf": cpf, "password": password},
                headers={
                    "Referer": f"{self.base_url}/",
                    "Origin": self.base_url,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=20,
                allow_redirects=True,
            )

            if "selectRole" not in res_login.url and "home" not in res_login.url:
                soup_err = BeautifulSoup(res_login.text, "lxml")
                danger_alert = soup_err.find(class_="alert-danger")
                error_msg = danger_alert.text.strip() if danger_alert else soup_err.get_text()[:200].strip()
                raise SIPEAuthError(f"Falha de autenticacao no SIPE: {error_msg}")

            if "home" in res_login.url:
                logger.info("Login efetuado com sucesso direto para home.")
                self._update_cookie_header()
                return True

            soup_role = BeautifulSoup(res_login.text, "lxml")
            role_token_input = soup_role.find("input", {"name": "_token"})
            if not role_token_input:
                raise SIPEAuthError("Token CSRF de selectRole nao encontrado.")
            role_token = role_token_input.get("value")

            # Resolve perfil dinâmico (último da lista)
            if perfil in ('ultimo', 'visitas-entradas', 'last'):
                select_role = soup_role.find("select", {"name": "app_role_id"})
                if select_role:
                    options = select_role.find_all("option")
                    valid_options = [
                        opt for opt in options 
                        if opt.get("value") and opt.get("value") != "0" and opt.text.strip()
                    ]
                    if valid_options:
                        perfil = valid_options[-1].get("value")
                        logger.info(f"Selecionado dinamicamente o ultimo perfil da lista: {perfil} ({valid_options[-1].text.strip()})")

            res_role = self.session.post(
                f"{self.base_url}/selectRole",
                data={"_token": role_token, "app_role_id": perfil, "unidade_id": unidade},
                headers={
                    "Referer": f"{self.base_url}/selectRole",
                    "Origin": self.base_url,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=20,
                allow_redirects=True,
            )

            if "home" not in res_role.url:
                raise SIPEAuthError(f"Falha ao selecionar papel no SIPE. URL final: {res_role.url}")

            logger.info("Login e selecao de papel efetuados com sucesso via HTTP.")
            self.perfil = perfil
            self.perfil_alias = perfil_id_original
            self.unidade = unidade
            self._update_cookie_header()
            return True
        except RequestException as exc:
            raise SIPEAuthError(f"Falha de rede ao tentar logar no SIPE: {exc}") from exc

    def selecionar_unidade(self, unidade_id: str) -> bool:
        """Altera a unidade ativa na sessao do SIPE sem precisar de login completo."""
        if not unidade_id:
            return False
            
        unidade_str = str(unidade_id).strip()
        if self.unidade == unidade_str:
            logger.debug(f"Unidade ja esta definida como {unidade_str} no SIPEClient.")
            return True
            
        logger.info(f"Alterando unidade no SIPE para ID: {unidade_str}")
        try:
            # 1. Obter pagina home ou selectRole para pegar o CSRF token
            res = self.session.get(f"{self.base_url}/selectRole", timeout=15)
            soup = BeautifulSoup(res.text, "lxml")
            
            token_input = soup.find("input", {"name": "_token"})
            if not token_input:
                res = self.session.get(f"{self.base_url}/home", timeout=15)
                soup = BeautifulSoup(res.text, "lxml")
                token_input = soup.find("input", {"name": "_token"})
                
            if not token_input:
                raise SIPEAuthError("Token CSRF nao encontrado para troca de unidade.")
                
            token = token_input.get("value")
            
            # 2. Fazer POST para selectRole
            res_role = self.session.post(
                f"{self.base_url}/selectRole",
                data={"_token": token, "app_role_id": self.perfil, "unidade_id": unidade_str},
                headers={
                    "Referer": f"{self.base_url}/selectRole",
                    "Origin": self.base_url,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=20,
                allow_redirects=True,
            )
            
            if "home" not in res_role.url:
                raise SIPEAuthError(f"Falha ao selecionar papel. URL final: {res_role.url}")
                
            self.unidade = unidade_str
            self._update_cookie_header()
            logger.info(f"Unidade alterada com sucesso para ID: {unidade_str}")
            return True
        except Exception as e:
            logger.warning(f"Erro ao trocar de unidade para {unidade_str}: {e}")
            return False

    def selecionar_perfil_e_unidade(self, perfil_id: str, unidade_id: str) -> bool:
        """Altera o perfil e a unidade ativos na sessao do SIPE."""
        if not perfil_id or not unidade_id:
            return False
            
        perfil_str = str(perfil_id).strip()
        unidade_str = str(unidade_id).strip()
        
        with self._role_lock:
            if (self.perfil == perfil_str or getattr(self, 'perfil_alias', None) == perfil_str) and self.unidade == unidade_str:
                logger.debug(f"Perfil {perfil_str} e unidade {unidade_str} ja estao definidos no SIPEClient.")
                return True
                
            logger.info(f"Alterando perfil para {perfil_str} e unidade para {unidade_str} no SIPE")
            try:
                # 1. Obter pagina selectRole para pegar o CSRF token e os perfis
                res = self.session.get(f"{self.base_url}/selectRole", timeout=15)
                if res.url and ("/login" in res.url or res.url.rstrip("/") == self.base_url.rstrip("/")):
                    logger.info("Redirecionado para o login ao acessar selectRole. Fazendo login direto com o perfil desejado...")
                    return self.login(perfil=perfil_str, unidade=unidade_str)
                soup = BeautifulSoup(res.text, "lxml")
                
                token_input = soup.find("input", {"name": "_token"})
                if not token_input:
                    res = self.session.get(f"{self.base_url}/home", timeout=15)
                    soup = BeautifulSoup(res.text, "lxml")
                    res = self.session.get(f"{self.base_url}/selectRole", timeout=15)
                    soup = BeautifulSoup(res.text, "lxml")
                    token_input = soup.find("input", {"name": "_token"})
                    
                if not token_input:
                    logger.info("Token CSRF nao encontrado para selectRole. Provavelmente a sessao expirou. Tentando login direto com perfil/unidade desejados...")
                    return self.login(perfil=perfil_str, unidade=unidade_str)
                    
                token = token_input.get("value")
                
                # Resolve perfil dinâmico (último da lista)
                if perfil_str in ('ultimo', 'visitas-entradas', 'last'):
                    select_role = soup.find("select", {"name": "app_role_id"})
                    if select_role:
                        options = select_role.find_all("option")
                        valid_options = [
                            opt for opt in options 
                            if opt.get("value") and opt.get("value") != "0" and opt.text.strip()
                        ]
                        if valid_options:
                            perfil_str = valid_options[-1].get("value")
                            logger.info(f"Selecionado dinamicamente o ultimo perfil da lista: {perfil_str} ({valid_options[-1].text.strip()})")
                
                # 2. Fazer POST para selectRole
                res_role = self.session.post(
                    f"{self.base_url}/selectRole",
                    data={"_token": token, "app_role_id": perfil_str, "unidade_id": unidade_str},
                    headers={
                        "Referer": f"{self.base_url}/selectRole",
                        "Origin": self.base_url,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    timeout=20,
                    allow_redirects=True,
                )
                
                if "home" not in res_role.url:
                    raise SIPEAuthError(f"Falha ao selecionar papel/unidade. URL final: {res_role.url}")
                    
                self.perfil = perfil_str
                self.perfil_alias = perfil_id
                self.unidade = unidade_str
                self._update_cookie_header()
                logger.info(f"Perfil alterado para {perfil_str} e unidade alterada para {unidade_str} com sucesso.")
                return True
            except Exception as e:
                logger.warning(f"Erro ao trocar de perfil/unidade para {perfil_str}/{unidade_str}: {e}")
                return False

    def _update_cookie_header(self, persist: bool = True) -> None:
        cookies_dict = self.session.cookies.get_dict()
        if cookies_dict:
            self.session.headers["Cookie"] = "; ".join(f"{key}={value}" for key, value in cookies_dict.items())
            logger.debug("Cabecalho literal Cookie atualizado a partir da jarra da sessao.")
            if persist:
                self._persist_cookies()

    def _request(self, method: str, path: str, **kwargs):
        with self._request_lock:
            return self._request_unlocked(method, path, **kwargs)

    def _request_unlocked(self, method: str, path: str, **kwargs):
        """Helper centralizado com retry exponencial, renovacao de sessao e cache Redis opcional."""
        url = f"{self.base_url}/{path.lstrip('/')}"
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
            cache_key = self._build_cache_key(path, kwargs.get("params"))
            try:
                cached_data = self.redis_client.get(cache_key)
                if cached_data:
                    data = json.loads(cached_data)
                    logger.info(f"Hit de cache no Redis para: {path}")
                    content_bytes = (
                        base64.b64decode(data["content_b64"])
                        if data.get("content_b64")
                        else data["text"].encode("utf-8")
                    )
                    return MockResponse(
                        status_code=data["status_code"],
                        headers=data["headers"],
                        content=content_bytes,
                        text=data["text"],
                        url=url,
                    )
            except Exception as exc:
                logger.warning(f"Erro ao ler cache do Redis: {exc}")

        max_http5xx_retries = 1  # HTTP 5xx do SIPE raramente se resolve com retry
        max_network_retries = 3  # erros de rede/conexao sao transitórios
        backoff_factor = 2.0
        initial_delay = 1.0
        session_renewed = False

        for attempt in range(1, max_network_retries + 1):
            try:
                cookie_header = self.session.headers.get("Cookie")
                if cookie_header:
                    kwargs.setdefault("headers", {})
                    kwargs["headers"]["Cookie"] = cookie_header

                response = self.session.request(method, url, **kwargs)

                is_expired = False
                if response.url and ("/login" in response.url or response.url.rstrip("/") == self.base_url):
                    is_expired = True
                elif "text/html" in response.headers.get("Content-Type", ""):
                    if 'name="password"' in response.text and 'name="cpf"' in response.text:
                        is_expired = True

                if is_expired:
                    if not session_renewed:
                        logger.info("Deteccao de sessao expirada no request. Tentando reautenticar...")
                        self.login()
                        session_renewed = True
                        continue
                    raise SIPEAuthError("Sessao expirada no SIPE e falha ao renovar.")

                response.raise_for_status()
                self._update_cookie_header(persist=False)

                if is_cacheable and response.status_code == 200 and cache_key:
                    try:
                        is_binary = "image" in response.headers.get("Content-Type", "") or path.endswith(
                            (".jpg", ".jpeg", ".png")
                        )
                        content_b64 = base64.b64encode(response.content).decode("utf-8") if is_binary else None
                        cache_payload = {
                            "status_code": response.status_code,
                            "headers": dict(response.headers),
                            "text": response.text,
                            "content_b64": content_b64,
                        }
                        self.redis_client.setex(cache_key, 300, json.dumps(cache_payload))
                        logger.info(f"Gravado em cache no Redis por 5 min: {path}")
                    except Exception as exc:
                        logger.warning(f"Erro ao gravar cache no Redis: {exc}")

                return response
            except HTTPError as exc:
                status_code = exc.response.status_code if exc.response else 500

                if status_code in (401, 403):
                    if not session_renewed:
                        acquired = self._auth_lock.acquire(blocking=False)
                        if acquired:
                            # Esta thread faz o login; outras aguardam no else abaixo
                            try:
                                logger.info(f"Erro HTTP {status_code} recebido. Renovando sessao...")
                                self.login()
                                session_renewed = True
                                continue
                            except Exception as login_err:
                                logger.error(f"Falha ao reautenticar apos erro {status_code}: {login_err}")
                                raise SIPEAuthError("Sessao expirada e reautenticacao falhou.") from exc
                            finally:
                                self._auth_lock.release()
                        else:
                            # Outra thread ja esta renovando — aguarda e tenta com os novos cookies
                            logger.info("Outra thread esta renovando a sessao. Aguardando conclusao...")
                            with self._auth_lock:
                                pass  # so aguarda; o login ja foi feito pela outra thread
                            session_renewed = True
                            continue
                    raise SIPEAuthError("Sessao expirada no SIPE.") from exc

                if status_code >= 500:
                    if attempt == max_http5xx_retries:
                        raise SIPEHTTPError(f"Erro HTTP do SIPE apos retries: {status_code}") from exc
                    delay = initial_delay * (backoff_factor ** (attempt - 1))
                    logger.warning(
                        f"Erro HTTP {status_code} no SIPE. Tentativa {attempt}/{max_http5xx_retries}. Retentando em {delay}s..."
                    )
                    time.sleep(delay)
                elif status_code == 404:
                    raise SIPENotFoundError(f"Recurso nao encontrado no SIPE: {path} (HTTP 404)") from exc
                else:
                    raise SIPEHTTPError(f"Erro HTTP do SIPE: {status_code}") from exc
            except RequestException as exc:
                if attempt == max_network_retries:
                    raise SIPEHTTPError(f"Falha de conexao persistente com o SIPE: {exc}") from exc
                delay = initial_delay * (backoff_factor ** (attempt - 1))
                logger.warning(
                    f"Falha de rede/conexao no SIPE ({exc}). Tentativa {attempt}/{max_network_retries}. Retentando em {delay}s..."
                )
                time.sleep(delay)

    def check_auth(self) -> bool:
        """Acessa /apenados/index para validar a sessao."""
        logger.info("Verificando autenticacao no SIPE...")
        response = self._request("GET", "/apenados/index")
        soup = BeautifulSoup(response.text, "lxml")
        _check_session_expired(soup)
        logger.info("Autenticacao valida no SIPE.")
        return True

    def pesquisar_apenado(self, termo: str, escolha: str = "nomeapenado") -> List[ApenadoSearchResult]:
        """Pesquisa apenado no SIPE."""
        logger.info(f"Pesquisando apenado com termo: {termo} (escolha: {escolha})")
        response = self._request("GET", "/apenados/index", params={"escolha": escolha, "parametro": termo})
        results = parse_search_results(response.text, self.base_url)
        logger.info(f"Pesquisa concluida. {len(results)} resultados encontrados.")
        return results

    def informacoes(self, apenado_id: str) -> ApenadoDetails:
        """Obtem ficha de informacoes do apenado."""
        logger.info(f"Obtendo informacoes do apenado ID: {apenado_id}")
        try:
            self._request("GET", f"/apenados/{apenado_id}/selecionarOpcao")
        except Exception as select_err:
            logger.warning(f"Aviso ao selecionarOpcao do apenado ID {apenado_id}: {select_err}")

        response = self._request("GET", f"/apenados/{apenado_id}/informacoes")
        details = parse_apenado_details(response.text, apenado_id, self.base_url)
        logger.info(f"Informacoes obtidas com sucesso para o apenado ID: {apenado_id}")
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
        return self.informacoes(results[0].id)
