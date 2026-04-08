# ============================================================================
# Makefile – Commandes utiles pour la plateforme Market Intelligence
# ============================================================================
# Utilisation :
#   make install      → Installe les dépendances Python
#   make web          → Lance l'API FastAPI et l'interface Web (UI)
#   make scheduler    → Lance le scheduler (collecte + NLP automatisés)
#   make collect      → Exécute une collecte manuelle unique
#   make collect_fx   → Exécute une collecte FX dédiée
#   make nlp          → Exécute le pipeline NLP manuellement
#   make aggregate    → Exécute l'agrégation quotidienne manuellement
#   make clean        → Nettoie les fichiers temporaires (__pycache__, *.pyc)
# ============================================================================

PYTHON = py
PIP = pip

# ── Installation ────────────────────────────────────────────────────────────
install:
	$(PIP) install -r requirements.txt

# ── Exécution ───────────────────────────────────────────────────────────────
web:
	$(PYTHON) main.py web

scheduler:
	$(PYTHON) main.py scheduler

collect:
	$(PYTHON) main.py collect

collect_fx:
	$(PYTHON) main.py collect_fx

nlp:
	$(PYTHON) main.py nlp

aggregate:
	$(PYTHON) main.py aggregate

consolidate:
	$(PYTHON) main.py consolidate

# ── Nettoyage ───────────────────────────────────────────────────────────────
clean:
	for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
	del /s /q *.pyc 2>nul || true

.PHONY: install web scheduler collect collect_fx nlp aggregate consolidate clean
