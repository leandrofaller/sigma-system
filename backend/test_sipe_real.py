import os
import sys
import logging
from dotenv import load_dotenv

# Configura PYTHONPATH temporário
sys.path.append(os.path.join(os.path.dirname(__file__), "app"))

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from sipe_sdk import SIPEClient

logging.basicConfig(level=logging.INFO)

def main():
    print("Iniciando teste real do SIPE SDK...")
    
    cpf = os.getenv("SIPE_CPF")
    senha = os.getenv("SIPE_SENHA")
    print(f"Credenciais carregadas: CPF={cpf[:3]}...{'*' * (len(cpf)-3) if cpf else None}, Senha={'Definida' if senha else 'Vazia'}")
    
    client = SIPEClient()
    
    # 1. Tentar verificar se os cookies atuais no .env são válidos
    try:
        print("\nTestando check_auth com cookies do .env...")
        client.check_auth()
        print("[OK] Autenticação válida com cookies do .env!")
    except Exception as e:
        print(f"[FALHA] Falha com cookies do .env: {e}")
        
        # 2. Se falhar, tentar fazer login automático com CPF/Senha
        try:
            print("\nTentando realizar login automático com CPF/Senha do .env...")
            client.login()
            print("[OK] Login automático realizado com sucesso!")
            
            print("\nTestando check_auth após login automático...")
            client.check_auth()
            print("[OK] Autenticação válida após login automático!")
        except Exception as login_err:
            print(f"[FALHA] Falha no login automático: {login_err}")
            return
            
    # 3. Tentar fazer uma busca de teste e analisar o HTML de /listagem/geral
    try:
        print("\nObtendo HTML de /listagem/geral...")
        res = client._request("GET", "/listagem/geral")
        print(f"[OK] Status de /listagem/geral: {res.status_code}")
        
        # Salva o HTML em arquivo para inspecao
        os.makedirs("scratch", exist_ok=True)
        with open("scratch/listagem_geral.html", "w", encoding="utf-8") as f:
            f.write(res.text)
        print("[OK] HTML salvo em scratch/listagem_geral.html")
                        
    except Exception as search_err:
        print(f"[FALHA] Falha na analise de listagem: {search_err}")

if __name__ == "__main__":
    main()
