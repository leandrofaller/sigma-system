import os
import sys
import logging

sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.sipe_sdk.client import SIPEClient

def main():
    try:
        from dotenv import load_dotenv
        load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

        client = SIPEClient()
        client.login(unidade="25")
        
        sipeId = 31417
        client._request("GET", f"/apenados/{sipeId}/selecionarOpcao")
        res_edit = client._request("GET", f"/apenados/{sipeId}/editar")
        
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(res_edit.text, "lxml")
        token = soup.find("input", {"name": "_token"})
        if not token:
            print("Token não encontrado!")
            return
        csrf_token = token.get("value")
        
        print("\n--- TESTANDO FORMATO 2 ---")
        res2 = client.session.post(
            f"{client.base_url}/relatorios/fichaGeral",
            data=[
                ("_token", csrf_token),
                ("apenado_id", str(sipeId)),
                ("listar[]", "DP"),
                ("listar[]", "M")
            ],
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        # Grava o HTML para podermos ver
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scratch', 'ficha-geral-format2.html')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(res2.text)
        print(f"Salvo HTML do formato 2 em {filepath} (tamanho: {len(res2.text)} bytes)")
        
        soup2 = BeautifulSoup(res2.text, "lxml")
        tables = soup2.find_all("table")
        print(f"Encontradas {len(tables)} tabelas no HTML.")
        for idx, table in enumerate(tables):
            headers = [th.get_text(strip=True) for th in table.find_all(["th", "td"]) if th.name == 'th' or th.parent.name == 'thead']
            print(f"Tabela {idx}: headers = {headers[:10]}...")
            print(f"  Linhas: {len(table.find_all('tr'))}")
            
    except Exception as err:
        print(f"Erro geral: {err}")

if __name__ == '__main__':
    main()
