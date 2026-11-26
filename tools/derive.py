#!/usr/bin/env python3
"""
Tukar data mentah kepada jadual analisis (CSV).

Input : fail JSON berformat {koleksi: {id: dokumen}}, iaitu
        - fail sandaran yang dimuat turun daripada apps (mod tempatan), atau
        - output tools/export_firestore.py
Output: folder CSV:
        sessions.csv, subtopic_results.csv, item_responses.csv, events.csv
        fuzzy_rows.csv  <- satu baris setiap pelajar x subtopik x sesi (Hari 1 dan 7)

Peraturan (daripada spesifikasi):
  - Hanya sesi complete = True. Jika ada beberapa cubaan, ambil cubaan
    lengkap yang pertama.
  - Delta (hari) = start sesi semasa - start sesi lengkap sebelumnya.
  - Savings % = (tempoh asal Hari 0 - tempoh semula) / tempoh asal x 100.
  - Hari 0 dengan passed_at_uji = True -> tempoh asal 0 -> Savings tidak
    boleh dikira (ditandakan flag_original_zero).
  - Metrik modaliti diambil daripada Uji (round = 0) sahaja.

Guna: python3 tools/derive.py data.json out_folder
"""
import csv
import json
import os
import sys
from collections import defaultdict
from statistics import mean

DAY_MS = 86_400_000


def load(path):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    return {k: list(v.values()) if isinstance(v, dict) else v for k, v in d.items()}


def write_csv(path, rows):
    if not rows:
        open(path, "w").close()
        return
    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for k, v in r.items()})


def main(src, out):
    os.makedirs(out, exist_ok=True)
    d = load(src)
    sessions = d.get("sessions", [])
    subs = d.get("subtopic_results", [])
    items = d.get("item_responses", [])
    events = d.get("events", [])

    for name, rows in [("sessions", sessions), ("subtopic_results", subs), ("item_responses", items), ("events", events)]:
        write_csv(os.path.join(out, f"{name}.csv"), rows)

    # cubaan lengkap pertama bagi setiap pelajar x sesi
    chosen = {}
    for s in sorted(sessions, key=lambda s: s.get("attempt", 1)):
        if s.get("complete") and (s["pid"], s["session_no"]) not in chosen:
            chosen[(s["pid"], s["session_no"])] = s
    chosen_ids = {s_id["pid"] + f"_s{s_id['session_no']}_a{s_id.get('attempt', 1)}" for s_id in chosen.values()}

    sub_by = {(r["session_id"], r["subtopic"]): r for r in subs}
    items_uji = defaultdict(list)
    for r in items:
        if r.get("round") == 0 and r["session_id"] in chosen_ids:
            items_uji[(r["session_id"], r["subtopic"])].append(r)

    rows = []
    pids = sorted({p for p, _ in chosen})
    for pid in pids:
        s0 = chosen.get((pid, 0))
        if not s0:
            continue
        prev = s0
        for n in (1, 2):
            s = chosen.get((pid, n))
            if not s:
                continue
            delta = (s["start_ms"] - prev["start_ms"]) / DAY_MS
            sid0 = f"{pid}_s0_a{s0.get('attempt', 1)}"
            sid = f"{pid}_s{n}_a{s.get('attempt', 1)}"
            for sub in ("S1", "S2", "S3"):
                r0, r = sub_by.get((sid0, sub)), sub_by.get((sid, sub))
                if not r0 or not r:
                    continue
                t0, t1 = r0.get("relearn_active_s"), r.get("relearn_active_s")
                savings = None
                if t0 and t1 is not None:
                    savings = round((t0 - t1) / t0 * 100, 1)
                uji = items_uji[(sid, sub)]
                gz = [x for x in uji if x["modality"] == "gaze"]
                tc = [x for x in uji if x["modality"] == "touch"]
                sp = [x for x in uji if x["modality"] == "speech"]
                row = {
                    "pid": pid, "session_no": n, "day": s.get("day"), "subtopic": sub,
                    "delta_days": round(delta, 3),
                    "original_s": t0, "relearn_s": t1, "savings_pct": savings,
                    "flag_original_zero": bool(r0.get("passed_at_uji")),
                    "uji_score": r.get("uji_score"), "uji_accuracy": (r.get("uji_score") or 0) / 5,
                    "uji_mean_rt_ms": r.get("uji_mean_rt_ms"),
                    "rounds_to_criterion": r.get("rounds_to_criterion"),
                    "paas": s.get("paas"),
                    "day0_uji_score": r0.get("uji_score"),
                    "gaze_ttt_ms": gz[0].get("gaze_ttt_ms") if gz else None,
                    "gaze_transitions": gz[0].get("gaze_transitions") if gz else None,
                    "gaze_correct": gz[0].get("correct") if gz else None,
                    "touch_mean_rt_ms": round(mean(x["rt_ms"] for x in tc)) if tc else None,
                    "touch_moves": sum(x.get("touch_moves", 0) for x in tc) if tc else None,
                    "touch_corrections": sum(x.get("touch_corrections", 0) for x in tc) if tc else None,
                    "speech_latency_ms": sp[0].get("speech_latency_ms") if sp else None,
                    "device_match": s.get("device_match"),
                }
                rows.append(row)
            prev = s
    write_csv(os.path.join(out, "fuzzy_rows.csv"), rows)
    print(f"{len(chosen)} sesi lengkap, {len(rows)} baris fuzzy -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
