"""Contrôle indépendant du règlement des pronostics : recalcule chaque pari à partir du score final et le compare au résultat enregistré
dans data/tracking.json. Code de sortie 1 s'il y a le moindre écart. Usage : python tests/settlement_audit.py"""
import json
import re
import sys


def num(x):
    return float(x.replace(",", "."))


def expect(m, p, h, a):
    """Résultat attendu d'après le score (True / False / None si remboursé), ou 'skip' si le pari ne se règle pas avec le seul score."""
    mk, sel, home, away = p["market"], p["sel"], m["home"], m["away"]
    if mk == "Résultat du match":
        return h > a if sel == home else a > h if sel == away else h == a if sel == "Match nul" else "skip"
    if mk == "Double chance":
        return {home + " ou nul": h >= a, away + " ou nul": a >= h, home + " ou " + away: h != a}.get(sel, "skip")
    r = re.match(r"^(Plus|Moins) de ([\d,]+) buts$", sel)
    if r and mk.startswith("Total buts"):
        return (h + a > num(r.group(2))) if r.group(1) == "Plus" else (h + a < num(r.group(2)))
    if mk == "Les deux équipes marquent":
        return (h > 0 and a > 0) if sel == "Oui" else not (h > 0 and a > 0)
    if mk.startswith("Vainqueur (rembours"):
        return None if h == a else (h > a if sel == home else a > h)
    if mk == "Victoire sans encaisser":
        return (h > a and a == 0) if sel == home else (a > h and h == 0)
    if mk == "Handicap -1":
        if sel.endswith("gagne par 2+"):
            return h - a >= 2
        if sel.startswith("Écart d'un but"):
            return h - a == 1
        if sel.endswith("(+1)"):
            return h - a <= 0
    r = re.match(r"^(.*) (plus|moins) de ([\d,]+)$", sel)
    if r and mk.startswith("Buts de "):
        g = h if r.group(1) == home else a if r.group(1) == away else None
        if g is None:
            return "skip"
        return g > num(r.group(3)) if r.group(2) == "plus" else g < num(r.group(3))
    return "skip"


def main():
    data = json.load(open("data/tracking.json", encoding="utf-8"))["matches"]
    total = bad = 0
    shown = []
    for k, m in data.items():
        if not m["settled"] or not re.match(r"^\d+-\d+$", m.get("result", "")):
            continue
        h, a = map(int, m["result"].split("-"))
        for p in m["picks"]:
            e = expect(m, p, h, a)
            if e == "skip":
                continue
            total += 1
            got = p.get("hit")
            if (e is None) != (got is None) or (e is not None and bool(e) != bool(got)):
                bad += 1
                if len(shown) < 10:
                    shown.append(f"{k} {m['result']} {p['market']} / {p['sel']} : enregistré {got}, attendu {e}")
    print(f"règlement : {total} pronostics recalculés, {bad} écart(s)")
    for s in shown:
        print(" ", s)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
