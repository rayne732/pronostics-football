"""Envoie le mail du matin (output/digest.txt + digest.html) par SMTP Gmail, une seule fois par jour.
Secrets attendus : GMAIL_USER, GMAIL_APP_PASSWORD (mot de passe d'application), MAIL_TO (facultatif, défaut = GMAIL_USER).
Sans secrets ou sans fichier du jour : ne fait rien. Le suivi « déjà envoyé » est dans data/notify_state.json (clé « mail »)."""
import json
import os
import smtplib
import sys
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo

STATE = "data/notify_state.json"


def main():
    user, pwd = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not pwd:
        print("[mail] GMAIL_USER / GMAIL_APP_PASSWORD absents : aucun mail envoyé.")
        return
    try:
        with open("output/digest.txt", encoding="utf-8") as fh:
            raw = fh.read()
        with open("output/digest.html", encoding="utf-8") as fh:
            html = fh.read()
    except OSError:
        print("[mail] pas de digest aujourd'hui : aucun mail.")
        return
    now = datetime.now(ZoneInfo("Europe/Paris"))
    if not 6 <= now.hour <= 21:
        print("[mail] hors plage horaire d'envoi.")
        return
    subject, _, body = raw.partition("\n\n")
    subject = subject.removeprefix("SUJET:").strip()
    if f"{now:%d/%m}" not in subject:
        print("[mail] le digest n'est pas celui d'aujourd'hui : aucun mail.")
        return
    try:
        with open(STATE, encoding="utf-8") as fh:
            state = json.load(fh)
    except (OSError, ValueError):
        state = {}
    if state.get("mail") == f"{now:%Y-%m-%d}":
        print("[mail] déjà envoyé aujourd'hui.")
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, user, os.environ.get("MAIL_TO") or user
    msg.set_content(body)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(user, pwd)
        smtp.send_message(msg)
    state["mail"] = f"{now:%Y-%m-%d}"            # écrit tout de suite : le workflow le sauvegarde même si une étape suivante échoue
    with open(STATE, "w", encoding="utf-8") as fh:
        json.dump(state, fh)
    print(f"[mail] envoyé : {subject}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:                        # un échec d'envoi ne doit pas faire échouer le site
        print(f"[avertissement] envoi du mail impossible : {exc}", file=sys.stderr)
