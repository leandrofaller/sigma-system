import re
from typing import List
from bs4 import BeautifulSoup
from .exceptions import SIPEAuthError, SIPENotFoundError
from .models import ApenadoSearchResult, ApenadoDetails

def _check_session_expired(soup: BeautifulSoup) -> None:
    """Verifica se a página retornada indica que a sessão expirou ou não está autenticada."""
    # Procura campos de senha ou formulários de login
    if soup.find("input", {"type": "password"}) or soup.find("form", action=re.compile(r"/login", re.I)):
        raise SIPEAuthError("Sessão expirada ou não autenticada no SIPE.")
    
    # Verifica pelo título ou outros elementos comuns da tela de login
    title_text = soup.title.string if soup.title else ""
    if "login" in title_text.lower() or "acesso" in title_text.lower() or "entrar" in title_text.lower():
        if not soup.find(string=re.compile(r"Ficha|Apenado|Consulta", re.I)):
            raise SIPEAuthError("Sessão expirada. Redirecionado para página de login.")

def parse_search_results(html_content: str, base_url: str) -> List[ApenadoSearchResult]:
    """
    Parseia a tela de listagem de apenados.
    Extrai links no padrão /apenados/{id}/selecionarOpcao.
    """
    soup = BeautifulSoup(html_content, "lxml")
    _check_session_expired(soup)
    
    results = []
    
    # Procura links com o padrão selecionarOpcao
    links = soup.find_all("a", href=re.compile(r"/apenados/[^/]+/selecionarOpcao"))
    
    for link in links:
        href = link.get("href", "")
        match = re.search(r"/apenados/([^/]+)/selecionarOpcao", href)
        if match:
            apenado_id = match.group(1)
            nome = ""

            # Em listagens do SIPE, o texto do link costuma ser apenas a ação.
            parent_row = link.find_parent("tr")
            if parent_row:
                cells = parent_row.find_all("td")
                action_text = link.get_text(strip=True)
                for cell in cells:
                    cell_text = cell.get_text(" ", strip=True)
                    if cell_text and cell_text != action_text:
                        nome = cell_text
                        break

            if not nome:
                nome = link.get_text(strip=True)
            
            url = f"{base_url.rstrip('/')}/apenados/{apenado_id}/selecionarOpcao"
            results.append(ApenadoSearchResult(id=apenado_id, nome=nome, url=url))
            
    # Se não houver resultados e houver avisos de busca vazia no HTML
    if not results:
        page_text = soup.get_text()
        if re.search(re.compile(r"nenhum registro encontrado|não foram encontrados|nada encontrado", re.I), page_text):
            raise SIPENotFoundError("Nenhum apenado encontrado para o termo pesquisado.")
            
    return results

def parse_apenado_details(html_content: str, apenado_id: str, base_url: str) -> ApenadoDetails:
    """
    Parseia a tela de informações do apenado.
    Extrai Nome, CPF, Processo, Nascimento, Cela, Foto e outros metadados.
    """
    soup = BeautifulSoup(html_content, "lxml")
    _check_session_expired(soup)
    
    body_text = soup.get_text()
    if "não encontrado" in body_text.lower() or "registro não existe" in body_text.lower():
        raise SIPENotFoundError(f"Apenado com ID {apenado_id} não encontrado no SIPE.")
    
    nome = ""
    cpf = None
    processo = None
    nascimento = None
    cela_atual = None
    foto_url = None
    informacoes_adicionais = {}
    
    # Foto do apenado
    img_tag = soup.find("img", src=re.compile(r"/fotos/|/foto/|/apenados/[^/]+/foto", re.I))
    if not img_tag:
        img_tag = soup.find("img", id=re.compile(r"foto|avatar|perfil", re.I))
    if not img_tag:
        img_tag = soup.find("img", class_=re.compile(r"foto|avatar|perfil", re.I))
        
    if img_tag:
        src = img_tag.get("src", "")
        if src.startswith("http"):
            foto_url = src
        else:
            foto_url = f"{base_url.rstrip('/')}/{src.lstrip('/')}"
            
    # Varredura de tabelas de chave-valor
    rows = soup.find_all("tr")
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) >= 2:
            for i in range(0, len(cells) - 1, 2):
                key = cells[i].get_text(strip=True).replace(":", "").strip()
                val = cells[i+1].get_text(strip=True).strip()
                if key and val:
                    informacoes_adicionais[key] = val
                    
    # Varredura secundária por rótulos (dl/dt/dd ou spans)
    labels = soup.find_all(string=re.compile(r":\s*$|Nome|CPF|Processo|Nascimento|Cela", re.I))
    for label in labels:
        parent = label.parent
        if parent:
            key = label.strip().replace(":", "").strip()
            sibling = parent.find_next_sibling()
            if sibling:
                val = sibling.get_text(strip=True)
                if val:
                    informacoes_adicionais[key] = val
            else:
                parent_text = parent.get_text(strip=True)
                if ":" in parent_text:
                    parts = parent_text.split(":", 1)
                    if len(parts) == 2:
                        k, v = parts[0].strip(), parts[1].strip()
                        if k and v:
                            informacoes_adicionais[k] = v

    # Mapeia chaves para as propriedades de ApenadoDetails
    for k, v in list(informacoes_adicionais.items()):
        kl = k.lower()
        if "nome" in kl and not nome:
            nome = v
        elif "cpf" in kl and not cpf:
            cpf = v
        elif ("processo" in kl or "execução" in kl) and not processo:
            processo = v
        elif ("nascimento" in kl or "data de nasc" in kl) and not nascimento:
            nascimento = v
        elif ("cela" in kl or "localização" in kl or "pavilhão" in kl) and not cela_atual:
            cela_atual = v

    # Fallbacks de extração de nome
    if not nome:
        h1 = soup.find("h1")
        if h1:
            nome = h1.get_text(strip=True)
        else:
            h2 = soup.find("h2")
            if h2:
                nome = h2.get_text(strip=True)
                
    if not nome:
        title = soup.title.string if soup.title else ""
        if "informações" in title.lower() or "apenado" in title.lower():
            parts = re.split(r"[-–—]", title)
            if len(parts) > 1:
                nome = parts[-1].strip()

    if not nome:
        raise SIPENotFoundError("Não foi possível extrair dados válidos do apenado (HTML malformado ou inválido).")

    return ApenadoDetails(
        nome=nome,
        cpf=cpf,
        processo=processo,
        nascimento=nascimento,
        cela_atual=cela_atual,
        foto_url=foto_url,
        informacoes_adicionais=informacoes_adicionais
    )
