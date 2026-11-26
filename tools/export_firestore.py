#!/usr/bin/env python3
"""
Eksport semua koleksi Firestore ke satu fail JSON (format sama dengan
sandaran apps), untuk diproses oleh tools/derive.py.

Persediaan (sekali sahaja):
  1. pip install firebase-admin
  2. Firebase Console > Project settings > Service accounts >
     Generate new private key. Simpan fail JSON itu di LUAR folder repo
     (JANGAN muat naik ke GitHub).

Guna:
  python3 tools/export_firestore.py /laluan/kunci-akaun-servis.json data.json
"""
import json
import sys

import firebase_admin
from firebase_admin import credentials, firestore

COLLECTIONS = ["participants", "sessions", "subtopic_results", "item_responses", "events"]


def clean(v):
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def main(key_path, out_path):
    firebase_admin.initialize_app(credentials.Certificate(key_path))
    db = firestore.client()
    out = {}
    for c in COLLECTIONS:
        out[c] = {doc.id: clean(doc.to_dict()) for doc in db.collection(c).stream()}
        print(f"{c}: {len(out[c])}")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("Disimpan:", out_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
