import os
import re
import urllib.parse
from bs4 import BeautifulSoup
from curl_cffi import requests
from dotenv import load_dotenv

# Carrega o arquivo .env da raiz do projeto
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=env_path)

cpf = os.getenv("SEJUS_SGP_USER") or os.getenv("SIPE_CPF") or ""
senha = os.getenv("SEJUS_SGP_PASS") or os.getenv("SIPE_SENHA") or ""

def format_cpf(c: str) -> str:
    clean = re.sub(r'\D', '', c)
    if len(clean) == 11:
        return f"{clean[0:3]}.{clean[3:6]}.{clean[6:9]}-{clean[9:11]}"
    return c

def clean_cpf(c: str) -> str:
    return re.sub(r'\D', '', c)

def test_login(cpf_to_send: str):
    print(f"\n--- Testando login no SGP com CPF: '{cpf_to_send}' ---")
    session = requests.Session(impersonate="chrome", timeout=20.0, allow_redirects=False)
    
    # 1. GET /login
    print("Efetuando GET /login...")
    res_get = session.get("https://sgp.sejus.ro.gov.br/login")
    print(f"Status GET /login: {res_get.status_code}")
    
    soup = BeautifulSoup(res_get.text, "lxml")
    token_input = soup.find("input", {"name": "_token"})
    if not token_input:
        print("Erro: Token CSRF não encontrado na página de login!")
        return
        
    token = token_input.get("value")
    print(f"Token CSRF: {token}")
    
    # 2. POST /auth
    headers = {
        "Referer": "https://sgp.sejus.ro.gov.br/login",
        "Origin": "https://sgp.sejus.ro.gov.br",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    
    data = {
        "_token": token,
        "cpf": cpf_to_send,
        "senha": senha
    }
    
    print("Efetuando POST /auth...")
    res_post = session.post("https://sgp.sejus.ro.gov.br/auth", data=data, headers=headers)
    print(f"Status POST /auth: {res_post.status_code}")
    print(f"Redirecionamento para: {res_post.headers.get('Location') or res_post.headers.get('location')}")
    
    redirect_url = res_post.headers.get("Location") or res_post.headers.get("location")
    
    if redirect_url:
        print(f"Seguindo redirecionamento para: {redirect_url}...")
        res_redir = session.get(redirect_url)
        print(f"Status redirecionamento: {res_redir.status_code}")
        
        soup_redir = BeautifulSoup(res_redir.text, "lxml")
        toast_body = soup_redir.find(class_="toast-body")
        if toast_body:
            print(f"Mensagem na página (toast-body): {toast_body.text.strip()}")
        else:
            alerts = soup_redir.find_all(class_=re.compile("alert|error|danger"))
            if alerts:
                for alert in alerts:
                    print(f"Alerta na página: {alert.text.strip()}")
            else:
                title = soup_redir.find("title")
                title_text = title.text.strip() if title else "Sem título"
                print(f"Título da página de destino: {title_text}")
                if "home" in redirect_url or "servidor" in res_redir.text or "sair" in res_redir.text.lower():
                    print("Sucesso! Login efetuado com sucesso no SGP!")
                else:
                    print(f"Não foi possível identificar o resultado. HTML parcial (primeiros 500 chars):")
                    print(res_redir.text[:500])
    else:
        print("Erro: Nenhum cabeçalho de redirecionamento recebido.")
        print("HTML da resposta:")
        print(res_post.text[:1000])

if __name__ == "__main__":
    if not cpf:
        print("CPF de login não configurado.")
        exit(1)
        
    print(f"CPF configurado no .env: {cpf}")
    print(f"Senha configurada no .env: {'*****' if senha else '(vazia)'}")
    
    # Teste 1: CPF formatado (com pontos e traço)
    test_login(format_cpf(cpf))
    
    # Teste 2: CPF limpo (só números)
    test_login(clean_cpf(cpf))
