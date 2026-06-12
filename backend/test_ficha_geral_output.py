import os
import sys
import json
from bs4 import BeautifulSoup
from curl_cffi import requests

sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

def main():
    try:
        # Carrega cookies do arquivo local
        cookie_path = os.path.join(os.path.dirname(__file__), 'app', 'sipe_sdk', 'sipe_cookies.json')
        if not os.path.exists(cookie_path):
            print(f"Arquivo de cookies não encontrado em {cookie_path}")
            return
            
        with open(cookie_path, 'r', encoding='utf-8') as f:
            cookies = json.load(f)
        print(f"Carregados {len(cookies)} cookies do cache local.")

        base_url = "https://sipe.sejus.ro.gov.br"
        session = requests.Session(impersonate="chrome")
        
        # Define os cookies na sessão
        host = base_url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        cookie_parts = []
        for key, value in cookies.items():
            cookie_parts.append(f"{key}={value}")
            session.cookies.set(key, value, domain=host)
        session.headers["Cookie"] = "; ".join(cookie_parts)
        session.headers.update({
            "Connection": "keep-alive",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        })

        sipeId = 31417
        unitId = '23' # ARIQUEMES
        
        # 1. Troca a unidade na sessão
        print(f"Trocando unidade para {unitId}...")
        res_select = session.get(f"{base_url}/selectRole")
        soup_select = BeautifulSoup(res_select.text, "lxml")
        token_select = soup_select.find("input", {"name": "_token"})
        if token_select:
            csrf_select = token_select.get("value")
            session.post(
                f"{base_url}/selectRole",
                data={"_token": csrf_select, "app_role_id": "2", "unidade_id": unitId},
                headers={"Referer": f"{base_url}/selectRole", "Content-Type": "application/x-www-form-urlencoded"}
            )
            print("Unidade selecionada com sucesso.")
        
        # 2. Seleciona o apenado
        print(f"Selecionando o apenado {sipeId}...")
        session.get(f"{base_url}/apenados/{sipeId}/selecionarOpcao")
        
        # 3. Pega a página de edição para obter o CSRF token
        print("Obtendo CSRF token da página de edição...")
        res_edit = session.get(f"{base_url}/apenados/{sipeId}/editar")
        soup_edit = BeautifulSoup(res_edit.text, "lxml")
        token_input = soup_edit.find("input", {"name": "_token"})
        if not token_input:
            print("Token CSRF de edição não encontrado!")
            # Imprime o início da resposta para ver se foi redirecionado
            print(res_edit.text[:300])
            return
        csrf_token = token_input.get("value")
        print(f"Token CSRF obtido: {csrf_token}")
        
        # 4. Faz o POST para a Ficha Geral
        print("Fazendo o POST para /relatorios/fichaGeral...")
        res_ficha = session.post(
            f"{base_url}/relatorios/fichaGeral",
            data=[
                ("_token", csrf_token),
                ("apenado_id", str(sipeId)),
                ("listar[]", "DP"),
                ("listar[]", "M")
            ],
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        print(f"Status Ficha Geral: {res_ficha.status_code}")
        print(f"Tamanho da resposta: {len(res_ficha.text)} bytes")
        
        # Salva o HTML
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scratch', 'ficha-geral-format2.html')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(res_ficha.text)
        print(f"HTML salvo em: {filepath}")
        
        # Analisa o HTML
        soup_ficha = BeautifulSoup(res_ficha.text, "lxml")
        tables = soup_ficha.find_all("table")
        print(f"\nEncontradas {len(tables)} tabelas:")
        for idx, table in enumerate(tables):
            headers = [th.get_text(strip=True) for th in table.find_all(["th", "td"]) if th.name == 'th' or th.parent.name == 'thead']
            rows = len(table.find_all("tr"))
            print(f"Tabela {idx}: headers = {headers[:10]}...")
            print(f"  Total de linhas: {rows}")
            
    except Exception as err:
        print(f"Erro: {err}")

if __name__ == '__main__':
    main()
