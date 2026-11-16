"""
fiplan_downloader.py (OljrSite/automation)
-------------------------------------------
Este arquivo é um redirecionador. O código real do robô está em:
  C:\\Users\\00537664157\\OneDrive\\CEO OlJr\\Python\\Robo_Fiplan_Downloader\\fiplan_downloader.py

Usa importlib para carregar o módulo real diretamente pelo caminho,
evitando conflito de nomes.
"""
import sys
import os
import importlib.util

# Caminho do arquivo real
_ROBO_DIR = os.path.join(
    os.path.expanduser("~"),
    "OneDrive", "CEO OlJr", "Python", "Robo_Fiplan_Downloader"
)
_REAL_FILE = os.path.join(_ROBO_DIR, "fiplan_downloader.py")

if not os.path.isfile(_REAL_FILE):
    raise ImportError(
        f"Arquivo do robô não encontrado: {_REAL_FILE}\n"
        "Verifique se o OneDrive está sincronizado."
    )

# Garante que o diretório do robô está no path (para sheets_auth, bq_loader etc.)
if _ROBO_DIR not in sys.path:
    sys.path.insert(0, _ROBO_DIR)

# Carrega o módulo real com nome interno diferente para evitar recursão
_spec = importlib.util.spec_from_file_location("_fiplan_downloader_real", _REAL_FILE)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

# Re-exporta tudo para que o fiplan_gui.py deste diretório enxergue normalmente
run = _mod.run

# Exporta funções opcionais que a GUI pode precisar
for _name in ("shutdown_shared_browser", "load_state", "save_state",
              "sanitize_filename", "check_control"):
    if hasattr(_mod, _name):
        globals()[_name] = getattr(_mod, _name)
