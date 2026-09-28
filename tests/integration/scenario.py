"""The demonstration this suite runs, in one place.

The constants live here rather than in conftest so a test can import them by
name without depending on which conftest.py pytest imported first.
"""
import os

AMOUNT = 2 * 10 ** 16                    # 0.02 GEN held against delivery
BOND = 10 ** 16                          # 0.01 GEN posted by the deliverer
FINALITY_DELAY = 300
DEADLINE_AHEAD = 45 * 60
RECOVERY_WINDOW = 3600

DEMO_COMMIT = os.environ.get("PACT_DEMO_COMMIT", "")
DEMO = f"https://raw.githubusercontent.com/Olawalter/Pact/{DEMO_COMMIT}/demo"

TITLE = "Verified company research report"
TERMS = ("The research agent must deliver a report containing at least 50 verified companies before "
         "the deadline. Each company must carry at least three qualifying sources, every required "
         "field must be present, and no fabricated citation may appear in the report.")

CONSTRAINTS = [
    {"type": "THRESHOLD", "requirement": "The report contains at least 50 companies.",
     "materiality": "MATERIAL"},
    {"type": "FACTUAL", "requirement": "Every required field is present for each company.",
     "materiality": "MATERIAL"},
    {"type": "THRESHOLD", "requirement": "Each company carries at least three qualifying sources.",
     "materiality": "MATERIAL"},
    {"type": "EXCLUSION", "requirement": "No fabricated citation appears in the report.",
     "materiality": "MATERIAL"},
    {"type": "TEMPORAL", "requirement": "The report was delivered before 2026-09-30T18:00:00Z.",
     "materiality": "MINOR"},
]
