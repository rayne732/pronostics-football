"""Sauvegarde hebdomadaire du suivi des pronostics (data/tracking.json, compressé) envoyée par mail, le dimanche, une seule fois par semaine.
C'est une copie HORS de GitHub : si le dépôt est perdu ou abîmé, le suivi (le seul fichier impossible à reconstruire) reste dans la boîte mail.
Secrets : GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO (facultatif). Sans secrets ou sans fichier : ne fait rien. État dans data/notify_state.json (clé « backup »)."""
import gzip
import json
import os
import smtplib
import sys
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo

STATE = "data/notify_state.json"
FILE = "data/tracking.json"


def main():
    user, pwd = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not pwd:
        print("[sauvegarde] secrets Gmail absents : rien envoyé.")
        return
    now = datetime.now(ZoneInfo("Europe/Paris"))
    if now.weekday() != 6 or not 6 <= now.hour <= 21:
        return
    week = f"{now.isocalendar()[0]}-S{now.isocalendar()[1]:02d}"
    try:
        with open(STATE, encoding="utf-8") as fh:
            state = json.load(fh)
    except (OSError, ValueError):
        state = {}
    if state.get("backup") == week:
        print("[sauvegarde] déjà envoyée cette semaine.")
        return
    try:
        with open(FILE, "rb") as fh:
            raw = fh.read()
        json.loads(raw)                                   # on n'envoie pas un fichier abîmé
    except (OSError, ValueError):
        print("[sauvegarde] suivi absent ou illisible : rien envoyé.")
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = f"Sauvegarde du suivi des pronostics ({now:%d/%m/%Y})", user, os.environ.get("MAIL_TO") or user
    msg.set_content("Copie hebdomadaire du suivi des pronostics (data/tracking.json, compressé en gzip).\n"
                    "Pour restaurer : décompresse la pièce jointe et remplace data/tracking.json dans le dépôt.")
    msg.add_attachment(gzip.compress(raw), maintype="application", subtype="gzip", filename=f"tracking-{now:%Y-%m-%d}.json.gz")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(user, pwd)
        smtp.send_message(msg)
    state["backup"] = week
    with open(STATE, "w", encoding="utf-8") as fh:
        json.dump(state, fh)
    print(f"[sauvegarde] envoyée ({len(raw) // 1024} Ko avant compression)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:                              # un échec d'envoi ne doit pas faire échouer le site
        print(f"[avertissement] sauvegarde impossible : {exc}", file=sys.stderr)
