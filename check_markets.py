"""Vérifie sur des saisons passées que les probabilités des marchés sont bien calibrées :
log-loss du modèle vs une fréquence constante (taux observé sur les matchs d'avant)."""
import sys
from datetime import datetime

import numpy as np

from markets import fit_all, markets
from poisson import load


def run(start, end, min_train=200):
    df = load()
    rows = []
    for d in sorted({r["Date"] for r in df if start <= r["Date"] < end}):
        train = [r for r in df if r["Date"] < d]
        if len(train) < min_train:
            continue
        models = fit_all(train, d)
        past = {  # taux de base observés avant la date
            "btts": np.mean([r["FTHG"] > 0 and r["FTAG"] > 0 for r in train]),
            "o15": np.mean([r["FTHG"] + r["FTAG"] > 1.5 for r in train]),
            "o25": np.mean([r["FTHG"] + r["FTAG"] > 2.5 for r in train]),
            "o35": np.mean([r["FTHG"] + r["FTAG"] > 3.5 for r in train]),
        }
        ctr = [float(r["HC"]) + float(r["AC"]) for r in train if r.get("HC")]
        past["c95"] = np.mean(np.array(ctr) > 9.5); past["c105"] = np.mean(np.array(ctr) > 10.5)
        for r in (r for r in df if r["Date"] == d):
            if r["HomeTeam"] not in models["goals"]["idx"] or r["AwayTeam"] not in models["goals"]["idx"]:
                continue
            m = markets(models, r["HomeTeam"], r["AwayTeam"])
            g = r["FTHG"] + r["FTAG"]
            c = float(r["HC"]) + float(r["AC"]) if r.get("HC") else None
            rows.append({
                "btts": (m["btts"], past["btts"], r["FTHG"] > 0 and r["FTAG"] > 0),
                "o15": (m["over"][1.5], past["o15"], g > 1.5),
                "o25": (m["over"][2.5], past["o25"], g > 2.5),
                "o35": (m["over"][3.5], past["o35"], g > 3.5),
                **({"c95": (m["corners"]["over"][9.5], past["c95"], c > 9.5),
                    "c105": (m["corners"]["over"][10.5], past["c105"], c > 10.5)} if c is not None else {}),
            })
    names = {"btts": "Les deux marquent", "o15": "+1,5 buts", "o25": "+2,5 buts", "o35": "+3,5 buts",
             "c95": "+9,5 corners", "c105": "+10,5 corners"}
    print(f"Saison {start.year}/{end.year - 2000} - {len(rows)} matchs")
    print(f"{'marché':20s}{'ll modèle':>10s}{'ll constant':>12s}{'gain ± err':>16s}{'proba moy. modèle':>19s}{'fréq. réelle':>14s}")
    for k, label in names.items():
        v = [r[k] for r in rows if k in r]
        p = np.clip([a for a, _, _ in v], 1e-4, 1 - 1e-4); q = np.array([b for _, b, _ in v]); y = np.array([c for _, _, c in v], float)
        ll = lambda x: -(y * np.log(x) + (1 - y) * np.log(1 - x))
        d = ll(q) - ll(p)
        print(f"{label:20s}{ll(p).mean():10.4f}{ll(q).mean():12.4f}{f'{d.mean():+.4f} ± {d.std(ddof=1) / np.sqrt(len(d)):.4f}':>16s}{p.mean():19.1%}{y.mean():14.1%}")
    print()


if __name__ == "__main__":
    run(datetime(2025, 7, 1), datetime(2026, 7, 1))
    run(datetime(2024, 7, 1), datetime(2025, 7, 1))
