from curl_cffi import requests
from bs4 import BeautifulSoup

try:
    print("Obtendo página de login do SIPE...")
    res = requests.get("https://sipe.sejus.ro.gov.br/", timeout=15)
    soup = BeautifulSoup(res.text, "lxml")
    
    # Imprimir o HTML do formulário de login
    form = soup.find("form")
    if form:
        print("[OK] Formulário encontrado!")
        print(f"Action: {form.get('action')}")
        print(f"Method: {form.get('method')}")
        print("Campos:")
        for inp in form.find_all("input"):
            print(f"  - name={inp.get('name')}, type={inp.get('type')}, value={inp.get('value')}")
    else:
        print("[ERRO] Formulário de login não encontrado na página!")
        # Salva o HTML de resposta para depurar
        with open("login_page_debug.html", "w", encoding="utf-8") as f:
            f.write(res.text)
        print("HTML da página gravado em login_page_debug.html para análise.")
except Exception as e:
    print("Erro ao acessar o SIPE:", e)
