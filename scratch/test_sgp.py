import sys
import os
import re

# Adiciona o diretório virtual do python ao path
venv_dir = r"f:\relatorio_claude\backend\.venv"
sys.path.insert(0, os.path.join(venv_dir, "Lib", "site-packages"))

from curl_cffi import requests as curl_requests

def test_login(cpf, senha):
    print(f"Testando login SGP para CPF: {cpf} e Senha: {senha}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    
    session = curl_requests.Session()
    
    # 1. Abre a página de login
    print("Acessando página de login...")
    res = session.get("https://sgp.sejus.ro.gov.br/login", headers=headers, impersonate="chrome", timeout=20.0)
    print(f"Status GET /login: {res.status_code}")
    
    # Busca o token CSRF
    match = re.search(r'name="_token"\s+value="([^"]+)"', res.text)
    if not match:
        # Tenta outra regex caso o espaçamento mude
        match = re.search(r'value="([^"]+)"\s+name="_token"', res.text)
        
    if not match:
        print("Erro: Token CSRF não encontrado!")
        return False
        
    token = match.group(1)
    print(f"Token CSRF encontrado: {token}")
    
    # 2. Faz o POST para /auth
    print("Fazendo POST de autenticação...")
    data = {
        "_token": token,
        "cpf": cpf,
        "senha": senha
    }
    
    auth_headers = headers.copy()
    auth_headers["Referer"] = "https://sgp.sejus.ro.gov.br/login"
    auth_headers["Origin"] = "https://sgp.sejus.ro.gov.br"
    
    res_auth = session.post(
        "https://sgp.sejus.ro.gov.br/auth",
        headers=auth_headers,
        data=data,
        impersonate="chrome",
        allow_redirects=False,
        timeout=20.0
    )
    
    print(f"Status POST /auth: {res_auth.status_code}")
    print("Headers de resposta:")
    for k, v in res_auth.headers.items():
        print(f"  {k}: {v}")
        
    redirect_loc = res_auth.headers.get("location") or res_auth.headers.get("Location")
    print(f"Redirect Location: {redirect_loc}")
    
    if redirect_loc and "login" not in redirect_loc:
        print("✅ Login efetuado com sucesso!")
        return True
    else:
        print("❌ Login falhou!")
        # Vamos ver se tem mensagem de erro no HTML de destino
        if redirect_loc:
            err_res = session.get(redirect_loc, headers=headers, impersonate="chrome")
            error_match = re.search(r'(?:toast-body|alert)[^>]*>([^<]+)', err_res.text)
            if error_match:
                print(f"Mensagem de erro do SGP: {error_match.group(1).strip()}")
        return False

print("=== TESTE 1: CPF FORMATADO ===")
test_login("770.320.552-49", "ZHW5pmq3njh1bdb-vyr")

print("\n=== TESTE 2: CPF LIMPO ===")
test_login("77032055249", "ZHW5pmq3njh1bdb-vyr")
