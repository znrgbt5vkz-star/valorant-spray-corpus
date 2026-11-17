from __future__ import annotations

import csv
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PAGES = ["index.html", "report.html", "codebook.html", "review.html", "ai-use.html"]
STRATEGIES = {"L", "P", "T", "E", "C", "R"}
FORMS = {"word", "phrase", "clause", "symbolic"}


class RefParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"link", "script", "img"}:
            for key in ("href", "src"):
                if attrs.get(key):
                    self.refs.append(attrs[key])
        if tag == "a" and attrs.get("href"):
            self.refs.append(attrs["href"])


def main() -> None:
    corpus = json.loads((DATA / "corpus.json").read_text(encoding="utf-8"))
    entries = corpus["entries"]
    assert corpus["entry_count"] == 939
    assert len(entries) == 939
    assert corpus["population_unique_pairs"] == 939
    assert corpus["sampling"]["method"] == "full census of eligible spray-name pairs"
    assert len({entry["id"] for entry in entries}) == 939
    assert len({entry["uuid"] for entry in entries}) == 939
    assert sum(1 for entry in entries if entry.get("manual_check_sample")) == 50

    counts = Counter()
    for entry in entries:
        for field in ("id", "uuid", "source_text", "target_text", "source", "category", "unit", "source_url_en", "source_url_zh", "strategy", "human_checked"):
            assert entry.get(field), (field, entry)
        assert entry["strategy_code"] in STRATEGIES
        assert entry["source_form"] in FORMS
        assert entry["human_checked"] in {"yes", "no"}
        assert entry["uuid"] in entry["source_url_en"]
        assert entry["uuid"] in entry["source_url_zh"]
        counts[entry["strategy_code"]] += 1
    assert dict(counts) == corpus["strategy_counts"]

    with (DATA / "corpus.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 939
    with (DATA / "manual-check-50.csv").open(encoding="utf-8-sig", newline="") as handle:
        check_rows = list(csv.DictReader(handle))
    assert len(check_rows) == 50

    for page in PAGES:
        path = ROOT / page
        assert path.exists(), page
        parser = RefParser()
        parser.feed(path.read_text(encoding="utf-8"))
        for ref in parser.refs:
            if ref.startswith(("http://", "https://", "#", "mailto:")):
                continue
            local = ref.split("?", 1)[0].split("#", 1)[0]
            if local:
                assert (ROOT / local).exists(), f"{page}: missing {local}"

    codebook = (ROOT / "codebook.html").read_text(encoding="utf-8")
    assert codebook.count('class="codebook-entry"') == 12  # six in English, six in Simplified Chinese
    report = (ROOT / "report.html").read_text(encoding="utf-8")
    for section in ("abstract", "origin", "background", "gap", "questions", "method", "analysis", "conclusion", "reflection", "limits", "references"):
        assert f'id="{section}"' in report
        assert f'id="zh-{section}"' in report

    print(json.dumps({
        "status": "ok",
        "entries": len(entries),
        "manual_check_sample": len(check_rows),
        "strategy_counts": counts,
        "pages": len(PAGES),
        "codebook_entries": 12,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
