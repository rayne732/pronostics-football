"""Tennis : notes Elo (globale + par surface) entraînées sur tennis-data.co.uk, calendrier et résultats ESPN.
Chaque pronostic est calculé avec les seules données antérieures au match (pas de triche), puis comparé au résultat."""
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime, timedelta, timezone

DATA = "data"
TD_PAGE = "https://tennis-data.co.uk/data.php"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/tennis/{tour}/scoreboard"
FIRST_YEAR = 2023
BACKTEST_FROM = date(2025, 1, 1)
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
SURF_W = 0.3                    # poids du bonus propre à la surface dans la note
K0, KEXP = 60.0, 0.3          # pas d'apprentissage : K = K0 / (matchs joués + 5) ** KEXP
UA = {"User-Agent": "Mozilla/5.0"}
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


# ------------------------------------------------------------------ données historiques (tennis-data.co.uk)
def _fetch(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as resp:
        return resp.read()


def _links():
    """{(tour, année): url} lues sur la page de téléchargement (le dossier contient un code qui peut changer)."""
    html = _fetch(TD_PAGE, 30).decode("utf-8", "ignore")
    out = {}
    for m in re.finditer(r'href="([^"]*?/(\d{4})(w?)/\d{4}\.xlsx)"', html, re.I):
        out[("WTA" if m.group(3) else "ATP", int(m.group(2)))] = "https://tennis-data.co.uk/" + m.group(1)
    return out


def _download(now):
    os.makedirs(DATA, exist_ok=True)
    try:
        links = _links()
    except Exception as exc:
        print(f"[avertissement] tennis-data indisponible : {exc}", file=sys.stderr)
        links = {}
    paths = {}
    for tour in ("ATP", "WTA"):
        for year in range(FIRST_YEAR, now.year + 1):
            path = os.path.join(DATA, f"tennis_{tour}_{year}.xlsx")
            fresh = os.path.exists(path) and (year < now.year or time.time() - os.path.getmtime(path) < 6 * 3600)
            if not fresh and (tour, year) in links:
                try:
                    with open(path, "wb") as fh:
                        fh.write(_fetch(links[(tour, year)]))
                except Exception as exc:
                    print(f"[avertissement] {tour} {year} : {exc}", file=sys.stderr)
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                paths[(tour, year)] = path
    return paths


def _read_xlsx(path):
    z = zipfile.ZipFile(path)
    strings = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))
               for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    head = None
    for row in sheet.find("m:sheetData", NS).findall("m:row", NS):
        cells = {}
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            if v is None:
                continue
            col = re.match(r"[A-Z]+", c.get("r")).group()
            cells[col] = strings[int(v.text)] if c.get("t") == "s" else v.text
        if head is None:
            head = cells
            continue
        yield {head[k]: v for k, v in cells.items() if k in head}


def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _load_td(now):
    """Matchs terminés lus sur tennis-data.co.uk (vide si le site est injoignable). Chaque match : dict(tour, d, surf, w, l, bo, psw, psl)."""
    out = []
    for (tour, year), path in _download(now).items():
        try:
            rows = list(_read_xlsx(path))
        except Exception as exc:
            print(f"[avertissement] lecture {path} : {exc}", file=sys.stderr)
            continue
        for r in rows:
            if r.get("Comment", "Completed") not in ("Completed", "Retired") or not r.get("Winner") or not r.get("Loser"):
                continue
            d = _num(r.get("Date"))
            if d is None:
                continue
            ow, ol = _num(r.get("PSW")) or _num(r.get("AvgW")), _num(r.get("PSL")) or _num(r.get("AvgL"))
            out.append(dict(tour=tour, d=date(1899, 12, 30) + timedelta(days=int(d)), surf=r.get("Surface", "Hard"),
                            city=r.get("Location", ""), tn=r.get("Tournament", ""), w=r["Winner"].strip(), l=r["Loser"].strip(),
                            bo=int(_num(r.get("Best of")) or 3), psw=ow, psl=ol, wr=_num(r.get("WRank")), lr=_num(r.get("LRank"))))
    out.sort(key=lambda m: (m["d"], m["tn"]))
    return out


CACHE = os.path.join(DATA, "tennis_matches.json")


def _name_index(rows):
    """(circuit, nom de famille, initiale) -> nom au format tennis-data (« Sinner J. »)."""
    idx = {}
    for r in rows:
        for n in (r["w"], r["l"]):
            m = re.match(r"^(.*?)\s+((?:[A-Z]\.)+)$", n)
            if m:
                first = m.group(2)[0].lower()
                for sur in {m.group(1), m.group(1).split()[0]}:
                    idx[(r["tour"], _norm(sur), first)] = n
    return idx


def _resolve(idx, full, tour):
    """Nom tennis-data d'un joueur ESPN ; à défaut le nom ESPN lui-même (joueur absent de tennis-data : qualifié, invité…)."""
    toks = full.replace("-", " ").split()
    tries = [(_norm("".join(toks[i:])), _norm(toks[0])[:1]) for i in range(1, len(toks))]
    if len(toks) >= 2:
        tries.append((_norm(toks[0]), _norm(toks[-1])[:1]))
    for sur, ini in tries:
        hit = idx.get((tour, sur, ini))
        if hit:
            return hit
    return full


def _read_cache():
    try:
        with open(CACHE, encoding="utf-8") as fh:
            c = json.load(fh)
    except (OSError, ValueError):
        return None
    rows = [dict(tour="ATP" if r[0] == 0 else "WTA", d=date.fromisoformat(r[1]), city=c["t"][r[2]][0], tn=c["t"][r[2]][1], surf=c["t"][r[2]][2], w=r[3], l=r[4], bo=r[5],
                 psw=None, psl=None, wr=None, lr=None) for r in c["rows"]]
    return rows, date.fromisoformat(c["td_last"]), set(c.get("espn", []))


def _write_cache(rows, td_last, ids):
    t_index, tl, out = {}, [], []
    for r in rows:
        key = (r["city"], r["tn"], r["surf"])
        if key not in t_index:
            t_index[key] = len(tl)
            tl.append(list(key))
        out.append([0 if r["tour"] == "ATP" else 1, r["d"].isoformat(), t_index[key], r["w"], r["l"], r["bo"]])
    os.makedirs(DATA, exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as fh:
        json.dump(dict(td_last=td_last.isoformat(), t=tl, rows=out, espn=sorted(ids)), fh, ensure_ascii=False, separators=(",", ":"))


def load_matches(now):
    """Historique des deux circuits : tennis-data.co.uk quand il répond (copie compacte gardée dans data/), sinon la copie ; dans les deux cas
    complété par les matchs terminés d'ESPN depuis la dernière date de tennis-data (il a quelques jours de retard)."""
    rows = _load_td(now)
    if rows:
        base, td_last, ids = rows, max(r["d"] for r in rows), set()
    else:
        cached = _read_cache()
        if not cached:
            return []
        base, td_last, ids = cached
    names = _name_index(base)
    try:
        raws = espn_matches(now)
    except Exception as exc:
        print(f"[avertissement] ESPN tennis : {exc}", file=sys.stderr)
        raws = []
    for raw in raws:
        if raw["state"] != "post" or raw["win"] is None or not raw["sets"] or raw["id"] in ids or raw["d"] <= td_last:
            continue
        res = [_resolve(names, n, raw["tour"]) for n in raw["names"]]
        base.append(dict(tour=raw["tour"], d=raw["d"], surf=surface_of(raw, base), city=raw["city"], tn=raw["tn"], w=res[raw["win"]], l=res[1 - raw["win"]],
                         bo=5 if raw["major"] else 3, psw=None, psl=None, wr=None, lr=None))
        ids.add(raw["id"])
    base.sort(key=lambda m: (m["d"], m["tn"]))
    _write_cache(base, td_last, ids)
    return base


# ------------------------------------------------------------------ modèle Elo
class Elo:
    """Note globale + bonus par surface ; pas d'ajustement qui diminue avec le nombre de matchs (K = 250/(n+5)^0.4)."""

    def __init__(self):
        self.r, self.s, self.n = {}, {}, {}

    def rating(self, p, surf):
        return self.r.get(p, 1500.0) + SURF_W * self.s.get((p, surf), 0.0)

    def prob(self, a, b, surf):
        return 1 / (1 + 10 ** ((self.rating(b, surf) - self.rating(a, surf)) / 400))

    def update(self, w, l, surf):
        p = self.prob(w, l, surf)
        for who, sign in ((w, 1), (l, -1)):
            k = K0 / (self.n.get(who, 0) + 5) ** KEXP
            self.r[who] = self.r.get(who, 1500.0) + sign * k * (1 - p)
            self.s[(who, surf)] = self.s.get((who, surf), 0.0) + sign * k * (1 - p)
            self.n[who] = self.n.get(who, 0) + 1


def train(matches, before=None, backtest=False):
    """Un Elo par circuit, entraîné sur les matchs avant `before`. Avec backtest=True renvoie aussi les prédictions
    faites juste avant chaque match de la période de test."""
    models = {"ATP": Elo(), "WTA": Elo()}
    recs = []
    for m in matches:
        if before and m["d"] >= before:
            break
        e = models[m["tour"]]
        if backtest and m["d"] >= BACKTEST_FROM:
            p = e.prob(m["w"], m["l"], m["surf"])
            known = e.n.get(m["w"], 0) >= 10 and e.n.get(m["l"], 0) >= 10
            bk = None
            if m["psw"] and m["psl"]:
                a, b = 1 / m["psw"], 1 / m["psl"]
                bk = a / (a + b)
            recs.append(dict(p=p, bk=bk, known=known, d=m["d"], x=e.rating(m["w"], m["surf"]) - e.rating(m["l"], m["surf"]),
                             rk=(math.log(m["lr"]) - math.log(m["wr"])) if m["wr"] and m["lr"] else None))
        e.update(m["w"], m["l"], m["surf"])
    return (models, recs) if backtest else models


def backtest_summary(recs):
    """Précision, log-loss, calibration ; comparaison avec les cotes Pinnacle sans marge sur les mêmes matchs."""
    recs = [r for r in recs if r["known"]]
    if not recs:
        return {}
    ll = lambda p: -math.log(min(max(p, 1e-6), 1 - 1e-6))
    both = [r for r in recs if r["bk"]]
    out = dict(n=len(recs), acc=sum(r["p"] > 0.5 for r in recs) / len(recs), logloss=sum(ll(r["p"]) for r in recs) / len(recs),
               n_bk=len(both), acc_bk=sum(r["bk"] > 0.5 for r in both) / max(len(both), 1),
               logloss_bk=sum(ll(r["bk"]) for r in both) / max(len(both), 1),
               logloss_m=sum(ll(r["p"]) for r in both) / max(len(both), 1),
               since=BACKTEST_FROM.isoformat(), until=max(r["d"] for r in recs).isoformat())
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
        sel = [max(r["p"], 1 - r["p"]) for r in recs if lo <= max(r["p"], 1 - r["p"]) < hi]
        win = [1 for r in recs if lo <= max(r["p"], 1 - r["p"]) < hi and (r["p"] > 0.5)]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(sel) / len(sel), real=len(win) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ noms de joueurs (ESPN <-> tennis-data)
def _norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s)


def build_index(models):
    """clé (nom de famille, initiale) -> (circuit, nom tennis-data) ; les noms composés sont aussi indexés par leur 1er mot."""
    idx = {}
    for tour, e in models.items():
        for name in e.n:
            m = re.match(r"^(.*?)\s+((?:[A-Z]\.)+)$", name)
            if not m:
                continue
            first = m.group(2)[0].lower()
            for sur in {m.group(1), m.group(1).split()[0]}:
                key = (_norm(sur), first)
                if key not in idx or e.n[name] > models[idx[key][0]].n.get(idx[key][1], 0):
                    idx[key] = (tour, name)
    return idx


def td_name(idx, full, tour):
    toks = full.replace("-", " ").split()
    tries = [(_norm("".join(toks[i:])), _norm(toks[0])[:1]) for i in range(1, len(toks))]     # « Prénom Nom »
    if len(toks) >= 2:
        tries.append((_norm(toks[0]), _norm(toks[-1])[:1]))                                      # « Nom Prénom » (joueurs asiatiques)
    for key in tries:
        hit = idx.get(key)
        if hit and hit[0] == tour:
            return hit[1]
    return None


# ------------------------------------------------------------------ marchés (nombre de sets)
def _score_probs(s, bo):
    """Probabilités des scores en sets (a, b) si le joueur A gagne un set avec la probabilité s."""
    w = (bo + 1) // 2
    out = {}
    for j in range(w):
        c = math.comb(w - 1 + j, j)
        out[(w, j)] = c * s ** w * (1 - s) ** j
        out[(j, w)] = c * (1 - s) ** w * s ** j
    return out


def set_prob(p, bo):
    lo, hi = 0.0, 1.0
    for _ in range(50):
        mid = (lo + hi) / 2
        pa = sum(v for (a, b), v in _score_probs(mid, bo).items() if a > b)
        lo, hi = (mid, hi) if pa < p else (lo, mid)
    return (lo + hi) / 2


def families(a, b, p, bo):
    """Marchés Winamax du tennis pour A contre B ; p = probabilité que A gagne le match."""
    sc = _score_probs(set_prob(p, bo), bo)
    tot = lambda f: sum(v for (x, y), v in sc.items() if f(x, y))
    F = [("Vainqueur du match", [[a, p], [b, 1 - p]], True, False)]
    F.append(("Handicap sets", [[a + " -1,5 set", tot(lambda x, y: x - y >= 2)], [b + " +1,5 set", tot(lambda x, y: x - y < 2)]], False, False))
    F.append(("Handicap sets", [[b + " -1,5 set", tot(lambda x, y: y - x >= 2)], [a + " +1,5 set", tot(lambda x, y: y - x < 2)]], False, False))
    lines = [2.5] if bo == 3 else [3.5, 4.5]
    for ln in lines:
        txt = str(ln).replace(".", ",")
        F.append(("Total sets", [["Plus de " + txt + " sets", tot(lambda x, y: x + y > ln)], ["Moins de " + txt + " sets", tot(lambda x, y: x + y < ln)]], False, False))
    cells = sorted(sc.items(), key=lambda kv: -kv[1])[:3]
    F.append(("Score en sets", [[(a if x > y else b) + f" {max(x, y)}-{min(x, y)}", v] for (x, y), v in cells], False, True))
    return F


def classify(F):
    safe, less = [], []
    for name, sels, validated, lottery in F:
        items = sorted(sels, key=lambda s: -s[1])
        rec = lambda it: dict(m=name, s=it[0], p=round(it[1], 4), v=validated, sels=[[s[0], round(s[1], 4)] for s in sels])
        if lottery:
            less.append(rec(items[0]))
            continue
        ok = [s for s in items if s[1] >= SAFE_MIN]
        if ok:
            safe.append(rec(min(ok, key=lambda s: s[1])))
        elif items[0][1] >= LESS_SAFE_MIN:
            less.append(rec(items[0]))
    key = lambda r: -r["p"]
    return sorted(safe, key=key), sorted(less, key=key)


# ------------------------------------------------------------------ calendrier et résultats (ESPN)
def paris(dt_utc):
    """Heure de Paris (naïve) d'un datetime UTC naïf."""
    try:
        from zoneinfo import ZoneInfo
        return dt_utc.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Europe/Paris")).replace(tzinfo=None)
    except Exception:                                           # sans base de fuseaux horaires : heure d'été = dernier dimanche de mars à octobre
        def last_sunday(y, mo):
            d = date(y, mo, 31)
            return d - timedelta(days=(d.weekday() + 1) % 7)
        y = dt_utc.year
        start = datetime.combine(last_sunday(y, 3), datetime.min.time()) + timedelta(hours=1)
        end = datetime.combine(last_sunday(y, 10), datetime.min.time()) + timedelta(hours=1)
        return dt_utc + timedelta(hours=2 if start <= dt_utc < end else 1)


def _espn(tour):
    try:
        return json.loads(_fetch(ESPN.format(tour=tour.lower()), 30))
    except Exception as exc:
        print(f"[avertissement] ESPN {tour} indisponible : {exc}", file=sys.stderr)
        return {}


def _iso(s):
    return datetime.strptime(s[:16], "%Y-%m-%dT%H:%M")


def espn_matches(now):
    """Simples des tournois en cours : liste de dicts bruts (a, b, statut, score, vainqueur…)."""
    out, seen = [], set()
    for feed in ("ATP", "WTA"):                                  # les deux flux contiennent aussi les tournois mixtes
        for ev in _espn(feed).get("events", []):
            for g in ev.get("groupings", []):
                gname = g["grouping"].get("displayName", "")
                if "Singles" not in gname:
                    continue
                tour = "ATP" if "Men" in gname else "WTA"
                for c in g["competitions"]:
                    if c["id"] in seen:
                        continue
                    seen.add(c["id"])
                    cs = c.get("competitors", [])
                    if len(cs) != 2 or any("athlete" not in x for x in cs):
                        continue
                    cs = sorted(cs, key=lambda x: x.get("order", 0))
                    state = c["status"]["type"]["state"]
                    when = paris(_iso(c["date"]))
                    sets = []
                    if state == "post":
                        n = max(len(x.get("linescores", [])) for x in cs)
                        for i in range(n):
                            try:
                                sets.append("%d-%d" % tuple(int(x["linescores"][i]["value"]) for x in cs))
                            except (IndexError, KeyError):
                                pass
                    win = next((i for i, x in enumerate(cs) if x.get("winner")), None)
                    flags = [re.sub(r".*/(\w+)\.png.*", r"\1", x["athlete"].get("flag", {}).get("href", "")).upper() for x in cs]
                    note = (c.get("notes") or [{}])[0].get("text", "")
                    out.append(dict(id=c["id"], tour=tour, tn=ev["name"], city=(ev.get("venue") or {}).get("displayName", "").split(",")[0],
                                    major=bool(ev.get("major")) and tour == "ATP", round=(c.get("round") or {}).get("displayName", ""),
                                    d=when.date(), t=f"{when:%H:%M}", state=state, names=[x["athlete"]["displayName"] for x in cs],
                                    flags=flags, sets=sets, win=win, retired=bool(re.search(r"ret|w/o|walkover|default", note, re.I)),
                                    court=(c.get("venue") or {}).get("court", "")))
    return out


def surface_of(raw, matches, default="Hard"):
    """Surface déduite du tournoi : même ville (ou même nom) dans les données des années précédentes."""
    city = _norm(raw["city"])
    name = _norm(raw["tn"])
    for m in reversed(matches):
        if m["tour"] == raw["tour"] and ((city and _norm(m["city"]) == city) or (_norm(m["tn"]) and _norm(m["tn"]) in name)):
            return m["surf"]
    return default


# ------------------------------------------------------------------ assemblage
MODEL_FILE = os.path.join(DATA, "tennis_model.json")


def export_model(cut, matches):
    """Notes arrondies des joueurs (au moins 10 matchs) + surfaces des tournois : le navigateur calcule avec, en direct."""
    out = {}
    for tour, e in cut.items():
        players = {n: [round(e.r.get(n, 1500.0), 1), c, {sf: round(v, 1) for (nm, sf), v in e.s.items() if nm == n}]
                   for n, c in e.n.items() if c >= 10}
        out[tour] = dict(p=players, idx={f"{k[0]}|{k[1]}": v[1] for k, v in build_index({tour: e}).items() if v[1] in players})
    by_city, by_tn = {}, {}
    for m in matches:
        if m["d"].year >= date.today().year - 3:
            by_city[_norm(m["city"])] = m["surf"]
            by_tn[_norm(m["tn"])] = m["surf"]
    out["surf"] = dict(city=by_city, tn={k: v for k, v in by_tn.items() if len(k) > 5})
    out.update(surf_w=SURF_W, safe=SAFE_MIN, less=LESS_SAFE_MIN)
    return out


def build(now, days=5):
    """Données tennis pour la page : modèle exporté + matchs d'hier à J+days (pronostic calculé avec les données d'avant hier)."""
    matches = load_matches(now)
    if not matches:                                           # tennis-data indisponible : dernier modèle sauvegardé
        try:
            with open(MODEL_FILE, encoding="utf-8") as fh:
                saved = json.load(fh)
            return dict(matches=[], bt=saved.get("bt", {}), model=saved["model"], generated=f"{now:%d/%m/%Y à %H:%M}")
        except (OSError, ValueError, KeyError):
            return {}
    start = now.date() - timedelta(days=1)
    end = now.date() + timedelta(days=days)
    models, recs = train(matches, backtest=True)
    bt = backtest_summary(recs)
    if not any(m["psw"] for m in matches):                    # sans cotes (copie du serveur) : on garde le dernier test complet
        try:
            with open(MODEL_FILE, encoding="utf-8") as fh:
                bt = json.load(fh).get("bt") or bt
        except (OSError, ValueError):
            pass
    cut = train(matches, before=start)                       # notes connues avant le premier jour affiché
    idx = build_index(cut)
    model = export_model(cut, matches)
    with open(MODEL_FILE, "w", encoding="utf-8") as fh:
        json.dump(dict(model=model, bt=bt), fh, ensure_ascii=False, separators=(",", ":"))
    items = []
    for raw in espn_matches(now):
        if not (start <= raw["d"] <= end):
            continue
        tdn = [td_name(idx, n, raw["tour"]) or (n if cut[raw["tour"]].n.get(n, 0) else None) for n in raw["names"]]
        known = [bool(n) and cut[raw["tour"]].n.get(n, 0) >= 10 for n in tdn]
        surf = surface_of(raw, matches)
        bo = 5 if raw["major"] else 3
        e = cut[raw["tour"]]
        p = e.prob(tdn[0], tdn[1], surf) if all(tdn) else 0.5
        if not all(known):
            p = 0.5                                           # historique insuffisant : aucune opinion
        F = families(raw["names"][0], raw["names"][1], p, bo)
        safe, less = classify(F) if all(known) else ([], [])
        item = dict(id=raw["id"], tour=raw["tour"], tn=raw["tn"], city=raw["city"], surf=surf, round=raw["round"], bo=bo,
                    date=raw["d"].isoformat(), time=raw["t"], state=raw["state"], a=raw["names"][0], b=raw["names"][1],
                    fa=raw["flags"][0], fb=raw["flags"][1], p=round(p, 4), known=all(known), safe=safe, less=less,
                    ra=round(e.rating(tdn[0], surf)) if tdn[0] else None, rb=round(e.rating(tdn[1], surf)) if tdn[1] else None,
                    court=raw["court"])
        if raw["state"] == "post":
            item.update(sets=raw["sets"], win=raw["win"], retired=raw["retired"])
            if raw["win"] is not None and not raw["retired"]:
                item["hit"] = (raw["win"] == 0) == (p > 0.5)
                a_sets = sum(int(s.split("-")[0]) > int(s.split("-")[1]) for s in raw["sets"])
                b_sets = len(raw["sets"]) - a_sets
                item["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=_won(r, raw, F, a_sets, b_sets), t=0) for r in safe]
                item["picks"] += [dict(m=r["m"], s=r["s"], p=r["p"], h=_won(r, raw, F, a_sets, b_sets), t=1) for r in less]
        items.append(item)
    items.sort(key=lambda x: (x["date"], x["time"], x["tour"]))
    return dict(matches=items, bt=bt, model=model, generated=f"{now:%d/%m/%Y à %H:%M}")


def _won(rec, raw, F, a_sets, b_sets):
    """Une sélection est-elle gagnée au vu du score final ?"""
    a, b = raw["names"]
    s = rec["s"]
    if rec["m"] == "Vainqueur du match":
        return s == (a if raw["win"] == 0 else b)
    if rec["m"].startswith("Handicap sets"):
        name = s.rsplit(" ", 2)[0]
        diff = (a_sets - b_sets) if name == a else (b_sets - a_sets)
        return diff >= 2 if "-1,5" in s else diff > -2
    if rec["m"] == "Total sets":
        n = a_sets + b_sets
        ln = float(re.search(r"(\d,\d)", s).group(1).replace(",", "."))
        return n > ln if s.startswith("Plus") else n < ln
    if rec["m"] == "Score en sets":
        m = re.match(r"(.*) (\d)-(\d)$", s)
        who, x, y = m.group(1), int(m.group(2)), int(m.group(3))
        return (who == a and (a_sets, b_sets) == (x, y)) or (who == b and (b_sets, a_sets) == (x, y))
    return False


if __name__ == "__main__":
    t0 = time.time()
    now = datetime.now()
    d = build(now)
    print("temps", round(time.time() - t0, 1), "s")
    print(json.dumps(d.get("bt"), ensure_ascii=False, indent=1))
    ms = d.get("matches", [])
    print(len(ms), "matchs;", sum(not m["known"] for m in ms), "avec joueur sans historique")
    for m in ms[:12]:
        print(m["date"], m["time"], m["tour"], m["surf"], m["a"], "-", m["b"], m["p"], m["state"], m.get("hit"))
