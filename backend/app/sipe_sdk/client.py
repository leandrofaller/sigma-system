import os
import logging
import re
from typing import List, Dict, Union, Optional
import httpx
from bs4 import BeautifulSoup

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
    """Formatter para logs que remove CPF, cookies e tokens."""
    CPF_PATTERN = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b")
    COOKIE_PATTERN = re.compile(r"(cookie|sessionid|token|laravel_session_sipe|xsrf-token|authorization)=[^;\s]+", re.I)

    def format(self, record: logging.LogRecord) -> str:
        original_msg = super().format(record)
        # Sanitizar CPF
        sanitized = self.CPF_PATTERN.sub("[CPF REDACTED]", original_msg)
        # Sanitizar cookies e tokens
        sanitized = self.COOKIE_PATTERN.sub(r"\1=[REDACTED]", sanitized)
        return sanitized

if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = SanitizingFormatter("[%(asctime)s] %(levelname)s in %(module)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class SIPEClient:
    """SDK de comunicação síncrona persistente com o SIPE."""

    def __init__(self, base_url: str = "https://sipe.sejus.ro.gov.br"):
        self.base_url = base_url.rstrip("/")
        
        # Inicializa o httpx.Client persistente
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        self.session = httpx.Client(
            base_url=self.base_url,
            headers=headers,
            follow_redirects=True,  # Redireciona 302 para login ao expirar a sessão
            timeout=25.0
        )
        
        # Tenta carregar cookies padrão das variáveis de ambiente
        laravel_session = os.getenv("SIPE_COOKIE_LARAVEL_SESSION")
        xsrf_token = os.getenv("SIPE_COOKIE_XSRF_TOKEN")
        
        env_cookies = {}
        if laravel_session:
            env_cookies["laravel_session_sipe"] = laravel_session
        if xsrf_token:
            env_cookies["XSRF-TOKEN"] = xsrf_token
            
        if env_cookies:
            self.set_cookies(env_cookies)
            logger.info("Cookies de sessão do SIPE carregados de variáveis de ambiente no init.")
        else:
            logger.warning("Nenhum cookie SIPE_COOKIE_LARAVEL_SESSION ou SIPE_COOKIE_XSRF_TOKEN foi encontrado no ambiente.")

    def set_cookies(self, cookies: Dict[str, str]) -> None:
        """Define ou atualiza os cookies da sessão persistente."""
        if not isinstance(cookies, dict):
            raise ValueError("Cookies devem ser passados como um dicionário.")
            
        # Atualiza a jarra de cookies do httpx
        for k, v in cookies.items():
            self.session.cookies.set(k, v)
        logger.info("Cookies de sessão atualizados no SIPEClient.")

    def check_auth(self) -> bool:
        """
        Verifica se a sessão atual do SIPE está válida acessando /apenados/index.
        Levanta SIPEAuthError se estiver inválida.
        """
        logger.info("Verificando autenticação no SIPE...")
        try:
            # Faz requisição de teste
            response = self.session.get("/apenados/index")
            response.raise_for_status()
            
            # Executa a verificação no HTML retornado
            soup = BeautifulSoup(response.text, "lxml")
            _check_session_expired(soup)
            
            logger.info("Autenticação válida no SIPE.")
            return True
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise SIPEAuthError("Sessão inválida ou expirada no SIPE.") from e
            raise SIPEHTTPError(f"Erro de resposta HTTP ao validar auth: {e.response.status_code}") from e
            
        except httpx.RequestError as e:
            raise SIPEHTTPError(f"Erro de rede ao validar auth: {str(e)}") from e
            
        except SIPEAuthError:
            # Repassa erro de autenticação identificado pelo parser
            raise
            
        except Exception as e:
            raise SIPEError(f"Erro ao verificar autenticação: {str(e)}") from e

    def pesquisar_apenado(self, termo: str, escolha: str = "nomeapenado") -> List[ApenadoSearchResult]:
        """
        Pesquisa apenados no SIPE.
        GET /apenados/index?escolha=nomeapenado&parametro=TERMO
        """
        logger.info(f"Pesquisando apenado com termo: {termo} (escolha: {escolha})")
        try:
            params = {
                "escolha": escolha,
                "parametro": termo
            }
            response = self.session.get("/apenados/index", params=params)
            response.raise_for_status()
            
            results = parse_search_results(response.text, self.base_url)
            logger.info(f"Pesquisa concluída. {len(results)} resultados encontrados.")
            return results

        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise SIPEAuthError("Sessão expirada ou não autenticada no SIPE.") from e
            raise SIPEHTTPError(f"Erro HTTP do SIPE ao pesquisar: {e.response.status_code}") from e
            
        except httpx.RequestError as e:
            raise SIPEHTTPError(f"Falha de conexão com o SIPE: {str(e)}") from e

    def informacoes(self, apenado_id: str) -> ApenadoDetails:
        """
        Retorna as informações detalhadas do apenado por ID.
        GET /apenados/{id}/informacoes
        """
        logger.info(f"Obtendo informações do apenado ID: {apenado_id}")
        try:
            # Seleciona a opção do apenado na sessão antes de buscar informações
            try:
                self.session.get(f"/apenados/{apenado_id}/selecionarOpcao")
            except Exception as select_err:
                logger.warning(f"Aviso ao selecionarOpcao do apenado ID {apenado_id}: {str(select_err)}")

            response = self.session.get(f"/apenados/{apenado_id}/informacoes")
            response.raise_for_status()
            
            details = parse_apenado_details(response.text, apenado_id, self.base_url)
            logger.info(f"Informações obtidas com sucesso para o apenado ID: {apenado_id}")
            return details

        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise SIPEAuthError("Sessão expirada ou não autenticada no SIPE.") from e
            raise SIPEHTTPError(f"Erro HTTP do SIPE ao obter detalhes: {e.response.status_code}") from e
            
        except httpx.RequestError as e:
            raise SIPEHTTPError(f"Falha de conexão com o SIPE: {str(e)}") from e

    # Métodos de HTML bruto

    def _get_raw_html(self, endpoint: str) -> str:
        """Método auxiliar interno para retornar HTML bruto de um endpoint."""
        try:
            response = self.session.get(endpoint)
            response.raise_for_status()
            
            # Verifica se a sessão expirou
            soup = BeautifulSoup(response.text, "lxml")
            _check_session_expired(soup)
            
            return response.text
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                raise SIPEAuthError("Sessão expirada ou não autenticada no SIPE.") from e
            raise SIPEHTTPError(f"Erro HTTP do SIPE no endpoint {endpoint}: {e.response.status_code}") from e
        except httpx.RequestError as e:
            raise SIPEHTTPError(f"Falha de rede ao acessar {endpoint}: {str(e)}") from e

    def fotos_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/fotos e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de fotos para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/fotos")

    def enderecos_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/enderecos e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de endereços para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/enderecos")

    def faccao_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/faccao e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de facção para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/faccao")

    def processos_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/incluirProcessos e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de processos para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/incluirProcessos")

    def alcunhas_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/alcunhas e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de alcunhas para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/alcunhas")

    def profissao_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/profissao e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de profissão para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/profissao")

    def triagem_html(self, apenado_id: str) -> str:
        """Acessa /apenados/{id}/triagem e retorna o HTML bruto."""
        logger.info(f"Buscando HTML de triagem para apenado ID: {apenado_id}")
        return self._get_raw_html(f"/apenados/{apenado_id}/triagem")

    # Ficha Completa

    def ficha_completa(self, termo: str) -> ApenadoDetails:
        """
        Pesquisa um termo, escolhe o primeiro apenado encontrado,
        obtem a ficha detalhada de informações e retorna estruturado.
        """
        logger.info(f"Obtendo ficha completa para termo: {termo}")
        results = self.pesquisar_apenado(termo)
        if not results:
            raise SIPENotFoundError(f"Nenhum apenado encontrado para o termo '{termo}'.")
            
        first_apenado = results[0]
        logger.info(f"Ficha completa: Selecionando primeiro apenado encontrado: {first_apenado.nome} (ID: {first_apenado.id})")
        return self.informacoes(first_apenado.id)
