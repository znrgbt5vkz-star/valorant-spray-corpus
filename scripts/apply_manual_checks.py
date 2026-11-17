from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RESULT = DATA / "manual-check-results.csv"

FIELDS = [
    "id", "source_text", "target_text", "source", "category", "unit",
    "source_core", "target_core", "strategy", "strategy_zh", "source_form", "asset_group", "release_year",
    "human_checked", "api_verified", "manual_check_sample", "uuid",
    "source_url_en", "source_url_zh", "image_url", "notes",
]


def main() -> None:
    if not RESULT.exists():
        raise SystemExit(f"Missing {RESULT}. Export the audit page first.")

    with RESULT.open(encoding="utf-8-sig", newline="") as handle:
        checked_ids = {
            row["id"]
            for row in csv.DictReader(handle)
            if (row.get("human_checked") or "").strip().lower() == "yes"
        }
    if not checked_ids:
        raise SystemExit("No rows with human_checked=yes found.")

    corpus_path = DATA / "corpus.json"
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    found = 0
    for entry in corpus["entries"]:
        if entry["id"] in checked_ids:
            entry["human_checked"] = "yes"
            found += 1
    corpus["human_checked_count"] = sum(1 for entry in corpus["entries"] if entry["human_checked"] == "yes")
    corpus_path.write_text(json.dumps(corpus, ensure_ascii=False, indent=2), encoding="utf-8")

    with (DATA / "corpus.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for entry in corpus["entries"]:
            writer.writerow({field: entry.get(field, "") for field in FIELDS})

    check_fields = ["id", "source_text", "target_text", "strategy", "api_verified", "source_url_en", "source_url_zh", "human_checked", "image_url", "notes"]
    with (DATA / "manual-check-50.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=check_fields)
        writer.writeheader()
        for entry in corpus["entries"]:
            if entry.get("manual_check_sample"):
                writer.writerow({field: entry.get(field, "") for field in check_fields})

    print(json.dumps({
        "updated": found,
        "human_checked_total": corpus["human_checked_count"],
        "remaining_in_audit_sample": sum(
            1 for entry in corpus["entries"]
            if entry.get("manual_check_sample") and entry["human_checked"] != "yes"
        ),
    }, indent=2))


if __name__ == "__main__":
    main()
