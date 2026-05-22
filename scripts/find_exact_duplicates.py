#!/usr/bin/env python3
"""
Detecta fotos exatamente iguais comparando hash SHA-256 dos arquivos.

Uso: python find_exact_duplicates.py <diretorio_uploads>
Saida: JSON com grupos de IDs de apenados com fotos identicas.
"""
import os
import sys
import json
import hashlib


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Uso: python find_exact_duplicates.py <diretorio>"}))
        sys.exit(1)

    uploads_dir = sys.argv[1]
    if not os.path.isdir(uploads_dir):
        print(json.dumps({"error": f"Diretorio nao encontrado: {uploads_dir}"}))
        sys.exit(1)

    EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
    hash_map: dict[str, list[str]] = {}
    errors: list[str] = []
    total = 0

    for filename in sorted(os.listdir(uploads_dir)):
        ext = os.path.splitext(filename)[1].lower()
        if ext not in EXTENSIONS:
            continue
        apenado_id = os.path.splitext(filename)[0]
        filepath = os.path.join(uploads_dir, filename)
        try:
            h = sha256_file(filepath)
            hash_map.setdefault(h, []).append(apenado_id)
            total += 1
        except OSError as e:
            errors.append(f"{filename}: {e}")

    groups = [ids for ids in hash_map.values() if len(ids) >= 2]

    print(json.dumps({
        "groups": groups,
        "totalFiles": total,
        "totalGroups": len(groups),
        "errors": errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
