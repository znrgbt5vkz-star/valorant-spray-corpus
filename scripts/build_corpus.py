from __future__ import annotations

import csv
import hashlib
import json
import random
import re
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DATA = ROOT / "data"
API = "https://valorant-api.com/v1"
LANG_EN = "en-US"
LANG_ZH = "zh-CN"
AUDIT_SEED = 20261117
CHECK_SIZE = 50

STRATEGIES = {
    "L": {
        "en": "Literal translation",
        "zh": "直译",
        "description_en": "The target keeps the source image, proposition and most lexical content, with only ordinary grammatical adjustment.",
        "description_zh": "译文保留原文意象、命题及大部分词汇内容，只作一般语法调整。",
    },
    "P": {
        "en": "Semantic paraphrase",
        "zh": "语义改写",
        "description_en": "The core meaning is retained, but wording, syntax or lexical choice is substantially rephrased.",
        "description_zh": "保留核心意思，但大幅改写措辞、句法或词汇选择。",
    },
    "T": {
        "en": "Transcreation",
        "zh": "创译",
        "description_en": "The translator creates a new expression or image to preserve the name's playful, rhetorical or branding effect.",
        "description_zh": "译者创造新的表达或意象，以保留名称的趣味、修辞或品牌效果。",
    },
    "E": {
        "en": "Explicitation",
        "zh": "显化",
        "description_en": "The target adds information that is implicit in the source image or name, making an entity, action or context explicit.",
        "description_zh": "译文补充原文意象或名称中隐含的信息，使人物、动作或情境更明确。",
    },
    "C": {
        "en": "Cultural substitution",
        "zh": "文化替换",
        "description_en": "The target replaces a source-language image or phrase with a recognisable Chinese idiom, proverb or culture-specific expression.",
        "description_zh": "译文以可辨识的中文成语、谚语或文化特定表达，替换原文意象或说法。",
    },
    "R": {
        "en": "Retention / phonetic transfer",
        "zh": "保留／音译",
        "description_en": "A proper name, acronym, number or brand element is retained in Latin script or transferred phonetically.",
        "description_zh": "专名、缩写、数字或品牌元素以拉丁字母保留，或以音译方式转入中文。",
    },
}


def fetch(endpoint: str, language: str | None = None) -> dict:
    url = f"{API}/{endpoint}"
    if language:
        url += f"?language={language}"
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.load(response)


def core_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\s+Spray$", "", value, flags=re.I)
    value = re.sub(r"\s*喷漆$", "", value)
    return value.strip()


def detect_asset_group(path: str) -> str:
    p = path.lower()
    if "champions" in p or "vct" in p:
        return "Esports"
    if "premier" in p:
        return "Premier"
    if "eventpass" in p or "event_pass" in p:
        return "Event Pass"
    if "battlepass" in p or "battle_pass" in p:
        return "Battle Pass"
    if "store" in p:
        return "Store"
    return "Other"


def detect_year(path: str, en_name: str) -> str:
    for text in (path, en_name):
        match = re.search(r"(?<!\d)(20\d{2})(?!\d)", text)
        if match:
            return match.group(1)
    return ""


def source_form(value: str) -> str:
    cleaned = re.sub(r"[^\w\s'’<>3-]", " ", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return "symbolic"
    tokens = [token for token in cleaned.split(" ") if re.search(r"[A-Za-z0-9]", token)]
    if not tokens:
        return "symbolic"
    if len(tokens) == 1:
        return "word"
    if len(tokens) <= 3:
        return "phrase"
    return "clause"


def stable_id(uuid: str, en: str, zh: str) -> str:
    digest = hashlib.sha1(f"{uuid}|{en}|{zh}".encode("utf-8")).hexdigest()[:10]
    return f"spray-{digest}"


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    version = fetch("version")["data"]
    snapshot_retrieved = date.today().isoformat()
    en_rows = fetch("sprays", LANG_EN)["data"]
    zh_rows = fetch("sprays", LANG_ZH)["data"]
    zh_by_uuid = {row["uuid"]: row for row in zh_rows}

    seen: set[tuple[str, str]] = set()
    unique = []
    for source in en_rows:
        target = zh_by_uuid.get(source["uuid"])
        if not target:
            continue
        en_name = (source.get("displayName") or "").strip()
        zh_name = (target.get("displayName") or "").strip()
        if not en_name or not zh_name or source.get("isNullSpray") or target.get("isNullSpray"):
            continue
        if "DisplayName" in en_name or "DisplayName" in zh_name:
            continue
        key = (en_name, zh_name)
        if key in seen:
            continue
        seen.add(key)
        path = source.get("assetPath") or ""
        en_core = core_name(en_name)
        zh_core = core_name(zh_name)
        has_cjk = bool(re.search(r"[\u4e00-\u9fff]", zh_core))
        has_latin = bool(re.search(r"[A-Za-z]", zh_core))
        unique.append({
            "id": stable_id(source["uuid"], en_name, zh_name),
            "uuid": source["uuid"],
            "source_text": en_name,
            "target_text": zh_name,
            "source_core": en_core,
            "target_core": zh_core,
            "asset_path": path,
            "asset_group": detect_asset_group(path),
            "release_year": detect_year(path, en_name),
            "target_has_cjk": has_cjk,
            "target_has_latin": has_latin,
            "source_form": source_form(en_core),
            "image_url": source.get("displayIcon") or "",
        })

    unique.sort(key=lambda item: (item["source_text"].casefold(), item["uuid"]))
    strategy_map = json.loads((ROOT / "scripts" / "strategy_map.json").read_text(encoding="utf-8"))
    missing = [entry["uuid"] for entry in unique if entry["uuid"] not in strategy_map]
    if missing:
        raise SystemExit(f"Missing strategy labels for {len(missing)} entries")

    sample = unique
    for index, entry in enumerate(sample):
        code = strategy_map[entry["uuid"]]
        entry["strategy_code"] = code
        entry["strategy"] = STRATEGIES[code]["en"]
        entry["strategy_zh"] = STRATEGIES[code]["zh"]
        entry["human_checked"] = "no"
        entry["api_verified"] = "yes"
        entry["category"] = entry["strategy"]
        entry["unit"] = "term" if entry["source_form"] == "word" else "short phrase"
        entry["source"] = f"VALORANT-API {version['branch']}; spray UUID {entry['uuid']}; retrieved {snapshot_retrieved}"
        entry["annotation_index"] = index
        entry["length_ratio"] = round(len(entry["target_core"]) / max(len(entry["source_core"]), 1), 2)
        entry["source_url_en"] = f"{API}/sprays/{entry['uuid']}?language={LANG_EN}"
        entry["source_url_zh"] = f"{API}/sprays/{entry['uuid']}?language={LANG_ZH}"
        entry["manual_check_sample"] = False

    snapshot = {
        "corpus": "VALORANT spray names (official English and Simplified Chinese localisation strings)",
        "source": "VALORANT-API",
        "source_note": "Community-maintained API derived from VALORANT game data; verify source terms before final publication.",
        "api_version": version,
        "retrieved": date.today().isoformat(),
        "languages": {"source": LANG_EN, "target": LANG_ZH},
        "population_unique_pairs": len(unique),
        "entry_count": len(sample),
        "sampling": {
            "method": "full census of eligible spray-name pairs",
            "unit": "unique English-Simplified Chinese spray-name pair",
            "sort_order": "source_text casefold, then UUID",
        },
        "filters": [
            "row present in both en-US and zh-CN responses",
            "non-empty source and target names",
            "isNullSpray false on both sides",
            "deduplicate exact source-target pairs",
            "exclude unresolved DisplayName placeholder records",
        ],
        "strategy_definitions": STRATEGIES,
        "strategy_counts": dict(Counter(entry["strategy_code"] for entry in sample)),
        "entries": sample,
    }

    fields = [
        "id", "source_text", "target_text", "source", "category", "unit",
        "source_core", "target_core", "strategy", "strategy_zh", "source_form", "asset_group", "release_year",
        "human_checked", "api_verified", "manual_check_sample", "uuid", "source_url_en", "source_url_zh", "image_url", "notes",
    ]
    with (DATA / "corpus.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in sample:
            writer.writerow({field: row.get(field, "") for field in fields})

    review_rng = random.Random(AUDIT_SEED + 1)
    review_sample = review_rng.sample(sample, CHECK_SIZE)
    review_sample.sort(key=lambda item: item["id"])
    for row in review_sample:
        row["manual_check_sample"] = True
    snapshot["manual_check_sample_size"] = CHECK_SIZE
    (DATA / "corpus.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    with (DATA / "manual-check-50.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fields_check = ["id", "source_text", "target_text", "strategy", "api_verified", "source_url_en", "source_url_zh", "human_checked", "image_url", "notes"]
        writer = csv.DictWriter(handle, fieldnames=fields_check)
        writer.writeheader()
        for row in review_sample:
            writer.writerow({field: row.get(field, "") for field in fields_check})

    print(json.dumps({
        "population_unique_pairs": len(unique),
        "entry_count": len(sample),
        "check_sample_size": CHECK_SIZE,
        "retrieved": snapshot["retrieved"],
        "version": version["branch"],
        "strategy_counts": snapshot["strategy_counts"],
        "api_url": f"{API}/sprays?language={LANG_EN}",
        "zh_api_url": f"{API}/sprays?language={LANG_ZH}",
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
