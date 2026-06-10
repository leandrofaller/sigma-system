from typing import Dict, Any, Optional
from pydantic import BaseModel

class ApenadoSearchResult(BaseModel):
    id: str
    nome: str
    url: str

class ApenadoDetails(BaseModel):
    nome: str
    cpf: Optional[str] = None
    processo: Optional[str] = None
    nascimento: Optional[str] = None
    cela_atual: Optional[str] = None
    foto_url: Optional[str] = None
    informacoes_adicionais: Dict[str, Any] = {}
