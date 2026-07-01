"""
Empirically derive the handicap + payout rules from the imported history,
so the engine matches what actually happened rather than assumptions.

Handicap: for each consecutive pair of MAIN games (chronological), look at how
each player's starting stack changed from game k -> k+1, grouped by how they
finished in game k (winner / in-the-money / lost). Reveals the real decrement/
increment steps and the effective clamp range.

Payout: for each main game, reconstruct the pot from entries+rebuys and check
whether winner deltas match a 65/35 (6-player) or winner-takes-all split.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

data = json.loads((Path(__file__).resolve().parents[1] / "data" / "data.json").read_text(encoding="utf-8"))
PLAYERS = data["players"]
events = data["events"]

main = [e for e in events if e["type"] == "main" and e["chips"]]
main.sort(key=lambda e: e["srcRow"])
print(f"main games: {len(main)}")


def present(e):
    """Players who actually played (have a chip stack this game)."""
    return [p for p in PLAYERS if e["chips"].get(p) is not None]


def finish(e, p):
    """Classify p's finish in game e from money deltas: 'win' / 'itm' / 'loss'."""
    plrs = present(e)
    d = {q: e["deltas"][q] for q in plrs}
    if p not in d:
        return None
    mx = max(d.values())
    positives = sorted([q for q in plrs if d[q] > 0], key=lambda q: -d[q])
    if d[p] == mx and d[p] > 0:
        return "win"
    if p in positives:                 # positive but not the top => 2nd/itm
        return "itm"
    return "loss"


# ---- Chip transitions grouped by finish ----
buckets = defaultdict(Counter)  # finish -> Counter(delta_chips)
clamp_lo, clamp_hi = [], []
for a, b in zip(main, main[1:]):
    for p in PLAYERS:
        ca, cb = a["chips"].get(p), b["chips"].get(p)
        if ca is None or cb is None:
            continue
        f = finish(a, p)
        if f is None:
            continue
        buckets[f][cb - ca] += 1
    for p in PLAYERS:
        c = a["chips"].get(p)
        if c is not None:
            clamp_lo.append(c); clamp_hi.append(c)

print("\n=== chip change (next stack - this stack) by finish this game ===")
for f in ("win", "itm", "loss"):
    common = buckets[f].most_common(8)
    print(f"  {f:5}: " + ", ".join(f"{int(dv):+d}×{n}" for dv, n in common))

print("\n=== observed stack range per player (min..max ever) ===")
for p in PLAYERS:
    vals = [e["chips"][p] for e in main if e["chips"].get(p) is not None]
    print(f"  {p:7}: {int(min(vals))}..{int(max(vals))}  (n={len(vals)})")


# ---- Payout check ----
print("\n=== payout reconstruction (main games) ===")
ENTRY = data["config"]["mainEntry"]
ok6 = bad6 = okN = badN = 0
examples = []
for e in main:
    plrs = present(e)
    buyins = e.get("buyins") or {}
    outlay = {p: ENTRY + (int(buyins.get(p) or 0)) * ENTRY for p in plrs}
    pot = sum(outlay.values())
    d = {p: e["deltas"][p] for p in plrs}
    winner = max(plrs, key=lambda p: d[p])
    n = len(plrs)
    if n == 6:
        # expected: 1st = 0.65*pot - outlay, 2nd = 0.35*pot - outlay
        second = max((p for p in plrs if p != winner), key=lambda p: d[p])
        exp_w = round(0.65 * pot - outlay[winner], 2)
        exp_2 = round(0.35 * pot - outlay[second], 2)
        if abs(d[winner] - exp_w) < 0.5 and abs(d[second] - exp_2) < 0.5:
            ok6 += 1
        else:
            bad6 += 1
            if len(examples) < 6:
                examples.append((e["rawLabel"], n, pot, d[winner], exp_w, d[second], exp_2))
    else:
        exp_w = round(pot - outlay[winner], 2)
        if abs(d[winner] - exp_w) < 0.5:
            okN += 1
        else:
            badN += 1

print(f"  6-player games: {ok6} match 65/35, {bad6} differ")
print(f"  <6-player games: {okN} match winner-takes-all, {badN} differ")
if examples:
    print("  sample 6-payer mismatches (label, n, pot, winD, exp, 2ndD, exp):")
    for x in examples:
        print("   ", x)
