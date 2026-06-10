import pytest
import time
import base64
import json
import logging
from unittest.mock import MagicMock
from curl_cffi import requests
from curl_cffi.requests.exceptions import HTTPError, RequestException
from sipe_sdk import (
    SIPEClient,
    ApenadoSearchResult,
    ApenadoDetails,
    SIPEAuthError,
    SIPENotFoundError,
    SIPEHTTPError
)
from sipe_sdk.parsers import parse_search_results, parse_apenado_details
from sipe_sdk.client import SanitizingFormatter

# Mocks HTML

MOCK_SEARCH_RESULTS_HTML = """
<!DOCTYPE html>
<html>
<head><title>SIPE - Apenados</title></head>
<body>
    <table>
        <tr>
            <td>JOAO DA SILVA SA</td>
            <td><a href="/apenados/987654/selecionarOpcao">Opção</a></td>
        </tr>
        <tr>
            <td>MARIA OLIVEIRA</td>
            <td><a href="/apenados/112233/selecionarOpcao">Opção</a></td>
        </tr>
    </table>
</body>
</html>
"""

MOCK_NO_RESULTS_HTML = """
<!DOCTYPE html>
<html>
<head><title>SIPE - Apenados</title></head>
<body>
    <div>Nenhum registro encontrado para a pesquisa.</div>
</body>
</html>
"""

MOCK_LOGIN_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head><title>SIPE - Entrar no Sistema</title></head>
<body>
    <form action="/login" method="post">
        <input type="password" name="password" />
        <input type="text" name="cpf" />
    </form>
</body>
</html>
"""

MOCK_APENADO_DETAILS_HTML = """
<!DOCTYPE html>
<html>
<head><title>SIPE - Informações</title></head>
<body>
    <h1>JOAO DA SILVA SA</h1>
    <img src="/fotos/987654_perfil.jpg" id="foto-perfil" />
    <table>
        <tr><th>Nome:</th><td>JOAO DA SILVA SA</td></tr>
        <tr><th>CPF:</th><td>123.456.789-00</td></tr>
        <tr><th>Processo:</th><td>7001234-56.2024.8.22.0001</td></tr>
        <tr><th>Data de Nascimento:</th><td>15/08/1990</td></tr>
        <tr><th>Cela Atual:</th><td>Pavilhão A - Cela 12</td></tr>
        <tr><th>Regime:</th><td>FECHADO</td></tr>
    </table>
</body>
</html>
"""

# Testes de Parsers Puros

def test_parse_search_results_success():
    base_url = "https://sipe.sejus.ro.gov.br"
    results = parse_search_results(MOCK_SEARCH_RESULTS_HTML, base_url)
    assert len(results) == 2
    assert results[0].id == "987654"
    assert results[0].nome == "Opção"
    assert results[0].url == "https://sipe.sejus.ro.gov.br/apenados/987654/selecionarOpcao"


def test_parse_search_results_no_results():
    base_url = "https://sipe.sejus.ro.gov.br"
    with pytest.raises(SIPENotFoundError):
        parse_search_results(MOCK_NO_RESULTS_HTML, base_url)


def test_parse_search_results_session_expired():
    base_url = "https://sipe.sejus.ro.gov.br"
    with pytest.raises(SIPEAuthError):
        parse_search_results(MOCK_LOGIN_PAGE_HTML, base_url)


def test_parse_apenado_details_success():
    base_url = "https://sipe.sejus.ro.gov.br"
    details = parse_apenado_details(MOCK_APENADO_DETAILS_HTML, "987654", base_url)
    assert details.nome == "JOAO DA SILVA SA"
    assert details.cpf == "123.456.789-00"
    assert details.processo == "7001234-56.2024.8.22.0001"
    assert details.nascimento == "15/08/1990"
    assert details.cela_atual == "Pavilhão A - Cela 12"
    assert details.foto_url == "https://sipe.sejus.ro.gov.br/fotos/987654_perfil.jpg"
    assert details.informacoes_adicionais.get("Regime") == "FECHADO"


# Testes de Sanitização de Logs

def test_logs_are_sanitized():
    formatter = SanitizingFormatter("%(message)s")
    
    # CPF formatado e sem formato
    record1 = logging.LogRecord("sipe", logging.INFO, "", 0, "Log com CPF 123.456.789-00 e 98765432100", (), None)
    assert formatter.format(record1) == "Log com CPF [CPF REDACTED] e [CPF REDACTED]"
    
    # Cookies, senhas e tokens
    record2 = logging.LogRecord(
        "sipe", logging.INFO, "", 0, 
        "Dados: cpf=123.456.789-00; password=minhasenha123; Cookie: laravel_session_sipe=abc123token; _token: xyz_token", 
        (), None
    )
    formatted = formatter.format(record2)
    assert "minhasenha123" not in formatted
    assert "abc123token" not in formatted
    assert "xyz_token" not in formatted
    assert "123.456.789-00" not in formatted


# Testes de Integração e Novas Políticas do SIPEClient

def test_client_check_auth_success(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = "<html><head><title>SIPE - Home</title></head><body>Autenticado</body></html>"
    mock_resp.status_code = 200
    mock_resp.url = "https://sipe.sejus.ro.gov.br/home"
    mock_resp.headers = {"Content-Type": "text/html"}
    
    monkeypatch.setattr(client.session, "request", MagicMock(return_value=mock_resp))
    assert client.check_auth() is True


def test_client_check_auth_failed(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = MOCK_LOGIN_PAGE_HTML
    mock_resp.status_code = 200
    mock_resp.url = "https://sipe.sejus.ro.gov.br/login"
    mock_resp.headers = {"Content-Type": "text/html"}
    
    monkeypatch.setattr(client.session, "request", MagicMock(return_value=mock_resp))
    # Para evitar loop infinito no teste, mockamos o login para falhar
    monkeypatch.setattr(client, "login", MagicMock(side_effect=SIPEAuthError("Falha")))
    with pytest.raises(SIPEAuthError):
        client.check_auth()


def test_client_login_success(monkeypatch):
    client = SIPEClient(cpf="12345678900", senha="senha_teste")
    
    mock_get_root = MagicMock()
    mock_get_root.text = '<html><input name="_token" value="csrf_token_val"/></html>'
    mock_get_root.status_code = 200
    
    mock_post_login = MagicMock()
    mock_post_login.url = "https://sipe.sejus.ro.gov.br/selectRole"
    mock_post_login.text = '<html><input name="_token" value="csrf_token_role"/></html>'
    mock_post_login.status_code = 200
    
    mock_post_role = MagicMock()
    mock_post_role.url = "https://sipe.sejus.ro.gov.br/home"
    mock_post_role.text = '<html>Home</html>'
    mock_post_role.status_code = 200
    
    # Configura os mocks para os requests internos
    mock_request = MagicMock(side_effect=[mock_get_root, mock_post_login, mock_post_role])
    monkeypatch.setattr(client.session, "request", mock_request)
    
    # Mocka os helpers de session
    monkeypatch.setattr(client.session, "get", lambda url, **k: mock_get_root)
    monkeypatch.setattr(client.session, "post", lambda url, data, **k: mock_post_login if "validaLogin" in url else mock_post_role)
    
    assert client.login() is True


def test_client_session_auto_renew(monkeypatch):
    client = SIPEClient(cpf="12345678900", senha="senha_teste")
    
    # Mock do login automático
    monkeypatch.setattr(client, "login", MagicMock(return_value=True))
    
    # Primeira chamada no _request simula expiração (redireciona para /login)
    mock_expired_resp = MagicMock()
    mock_expired_resp.url = "https://sipe.sejus.ro.gov.br/login"
    mock_expired_resp.text = "<html>Entrar</html>"
    mock_expired_resp.headers = {"Content-Type": "text/html"}
    mock_expired_resp.status_code = 200
    
    # Segunda chamada simula sucesso
    mock_success_resp = MagicMock()
    mock_success_resp.url = "https://sipe.sejus.ro.gov.br/apenados/index"
    mock_success_resp.text = MOCK_SEARCH_RESULTS_HTML
    mock_success_resp.headers = {"Content-Type": "text/html"}
    mock_success_resp.status_code = 200
    
    request_mock = MagicMock(side_effect=[mock_expired_resp, mock_success_resp])
    monkeypatch.setattr(client.session, "request", request_mock)
    
    results = client.pesquisar_apenado("Joao")
    assert len(results) == 2
    assert request_mock.call_count == 2


def test_client_retry_exponential(monkeypatch):
    client = SIPEClient()
    monkeypatch.setattr(time, "sleep", MagicMock())
    
    mock_err_resp = MagicMock()
    mock_err_resp.status_code = 500
    mock_err_resp.raise_for_status.side_effect = HTTPError("HTTP Error 500", code=0, response=mock_err_resp)
    
    mock_success_resp = MagicMock()
    mock_success_resp.status_code = 200
    mock_success_resp.text = "<div>Sucesso</div>"
    mock_success_resp.url = "https://sipe.sejus.ro.gov.br/teste"
    mock_success_resp.headers = {}
    
    request_mock = MagicMock(side_effect=[mock_err_resp, mock_err_resp, mock_success_resp])
    monkeypatch.setattr(client.session, "request", request_mock)
    
    resp = client._request("GET", "/teste")
    assert resp.status_code == 200
    assert request_mock.call_count == 3


def test_client_redis_cache(monkeypatch):
    mock_redis = MagicMock()
    # 1ª chamada: None (cache miss)
    # 2ª chamada: cache hit
    mock_redis.get.side_effect = [None, json.dumps({
        "status_code": 200,
        "headers": {},
        "text": "<div>Hit Cache</div>",
        "content_b64": None
    })]
    
    client = SIPEClient()
    client.redis_client = mock_redis
    
    mock_net_resp = MagicMock()
    mock_net_resp.status_code = 200
    mock_net_resp.text = "<div>Hit Rede</div>"
    mock_net_resp.url = "https://sipe.sejus.ro.gov.br/teste-cache"
    mock_net_resp.headers = {"Content-Type": "text/html"}
    
    request_mock = MagicMock(return_value=mock_net_resp)
    monkeypatch.setattr(client.session, "request", request_mock)
    
    # Cache miss
    resp1 = client._request("GET", "/teste-cache")
    assert resp1.text == "<div>Hit Rede</div>"
    assert mock_redis.get.call_count == 1
    assert mock_redis.setex.call_count == 1
    
    # Cache hit
    resp2 = client._request("GET", "/teste-cache")
    assert resp2.text == "<div>Hit Cache</div>"
    assert mock_redis.get.call_count == 2
    assert request_mock.call_count == 1


def test_client_html_bruto_methods(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = "<div>HTML BRUTO</div>"
    mock_resp.status_code = 200
    mock_resp.url = "https://sipe.sejus.ro.gov.br/apenados/123/fotos"
    mock_resp.headers = {}
    
    mock_request = MagicMock(return_value=mock_resp)
    monkeypatch.setattr(client.session, "request", mock_request)
    
    assert client.fotos_html("123") == "<div>HTML BRUTO</div>"
    assert client.enderecos_html("123") == "<div>HTML BRUTO</div>"
    assert client.faccao_html("123") == "<div>HTML BRUTO</div>"
    assert client.processos_html("123") == "<div>HTML BRUTO</div>"
    assert client.alcunhas_html("123") == "<div>HTML BRUTO</div>"
    assert client.profissao_html("123") == "<div>HTML BRUTO</div>"
    assert client.triagem_html("123") == "<div>HTML BRUTO</div>"
