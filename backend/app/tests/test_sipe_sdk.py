import pytest
from unittest.mock import MagicMock
from sipe_sdk import (
    SIPEClient,
    ApenadoSearchResult,
    ApenadoDetails,
    SIPEAuthError,
    SIPENotFoundError,
    SIPEHTTPError
)
from sipe_sdk.parsers import parse_search_results, parse_apenado_details

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

MOCK_APENADO_NOT_FOUND_HTML = """
<!DOCTYPE html>
<html>
<body>
    <div>Apenado não encontrado no sistema.</div>
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


# Testes de Integração com SIPEClient (Mockando httpx.Client)

def test_client_check_auth_success(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = "<html><head><title>SIPE - Home</title></head><body>Autenticado</body></html>"
    mock_resp.status_code = 200
    
    monkeypatch.setattr(client.session, "get", MagicMock(return_value=mock_resp))
    assert client.check_auth() is True


def test_client_check_auth_failed(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = MOCK_LOGIN_PAGE_HTML
    mock_resp.status_code = 200
    
    monkeypatch.setattr(client.session, "get", MagicMock(return_value=mock_resp))
    with pytest.raises(SIPEAuthError):
        client.check_auth()


def test_client_pesquisar_apenado(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = MOCK_SEARCH_RESULTS_HTML
    mock_resp.status_code = 200
    
    monkeypatch.setattr(client.session, "get", MagicMock(return_value=mock_resp))
    results = client.pesquisar_apenado("Joao")
    assert len(results) == 2
    assert results[0].id == "987654"


def test_client_informacoes(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = MOCK_APENADO_DETAILS_HTML
    mock_resp.status_code = 200
    
    monkeypatch.setattr(client.session, "get", MagicMock(return_value=mock_resp))
    details = client.informacoes("987654")
    assert details.nome == "JOAO DA SILVA SA"
    assert details.cpf == "123.456.789-00"


def test_client_ficha_completa(monkeypatch):
    client = SIPEClient()
    
    # Mocka get para retornar a busca primeiro, e depois os detalhes
    mock_resp_search = MagicMock()
    mock_resp_search.text = MOCK_SEARCH_RESULTS_HTML
    mock_resp_search.status_code = 200
    
    mock_resp_details = MagicMock()
    mock_resp_details.text = MOCK_APENADO_DETAILS_HTML
    mock_resp_details.status_code = 200
    
    # Intercepta as chamadas sequenciais
    mock_get = MagicMock(side_effect=[mock_resp_search, mock_resp_details, mock_resp_details])
    monkeypatch.setattr(client.session, "get", mock_get)
    
    details = client.ficha_completa("Joao")
    assert details.nome == "JOAO DA SILVA SA"
    assert details.cpf == "123.456.789-00"


def test_client_html_bruto_methods(monkeypatch):
    client = SIPEClient()
    mock_resp = MagicMock()
    mock_resp.text = "<div>HTML BRUTO</div>"
    mock_resp.status_code = 200
    
    mock_get = MagicMock(return_value=mock_resp)
    monkeypatch.setattr(client.session, "get", mock_get)
    
    assert client.fotos_html("123") == "<div>HTML BRUTO</div>"
    assert client.enderecos_html("123") == "<div>HTML BRUTO</div>"
    assert client.faccao_html("123") == "<div>HTML BRUTO</div>"
    assert client.processos_html("123") == "<div>HTML BRUTO</div>"
    assert client.alcunhas_html("123") == "<div>HTML BRUTO</div>"
    assert client.profissao_html("123") == "<div>HTML BRUTO</div>"
    assert client.triagem_html("123") == "<div>HTML BRUTO</div>"
