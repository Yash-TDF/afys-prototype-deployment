"""Build src/data/fieldwork.json from the three sources THE-348 names.

Read-only on every source; writes one file. Needs pyreadstat (the portal's pipeline
environment has it):

    PYTHONUTF8=1 python tools/build-fieldwork.py [--sav PATH] [--workbook PATH]

Sources
  1. Interviews per country and wave: the delivered four-wave SPSS file, unweighted rows,
     `job` (1 = 2020, 2 = 2022, 3 = 2024, 4 = 2026, per PSB 23 Sep 2026) by `QCOUNTRY` value
     label.
  2. Languages and locations: PSB's workbook of 28 Sep 2026, cell text as supplied with
     whitespace collapsed. Tanzania's two columns are as PSB supplied them; the row carries a
     query rather than a correction, and the page shows both cells as being checked.
  3. Regions: PSB's four 2026 groups from their 23 Sep reply. The twelve earlier-wave markets
     have no agreed region (THE-217) and are left ungrouped.

Published wave totals are PSB's; 2026 has none. Two waves carry a query: 2022, because
whether PSB's published tables base on 4,507 or on the 4,206 "Overall 2021" group is open
with PSB, and 2024, which counts 29 short of the published 5,604.

Refuses to write if the country-waves counted from the file do not equal the seeded
membership in content.json, so the page can never show a count for a wave a country was not
in, or miss one it was.
"""
import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pyreadstat

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SAV = ROOT.parent / "docs" / "adr" / "Ichikowitz Family Foundation (IFF) - Africa Youth Survey Merged Final Data 04.30.26 dashboard 1.sav"
DEFAULT_XLSX = ROOT.parent / "docs" / "adr" / "Languages and Locations.xlsx"
CONTENT = ROOT / "src" / "data" / "content.json"
OUT = ROOT / "src" / "data" / "fieldwork.json"

WAVE_OF_JOB = {1: 2020, 2: 2022, 3: 2024, 4: 2026}
# What PSB has published for each wave's interview count; 2026 has no published total.
PUBLISHED = {2020: 4200, 2022: 4507, 2024: 5604, 2026: None}
# What is open with PSB about a wave's count, shown beside the figure.
WAVE_QUERIES = {
    2022: "PSB's published 2022 tables may be based on the 4,206 interviews of their "
          "“Overall 2021” group rather than all 4,507; being checked with PSB.",
    2024: "29 short of the published 5,604; being checked with PSB.",
}
# What is open with PSB about a country's supplied languages and locations.
COUNTRY_QUERIES = {
    "Tanzania": "The languages and locations appear to have swapped columns in the supplied "
                "list; being checked with PSB.",
}
# The file's spellings that differ from the seeds'.
SEED_NAME = {"Democratic Republic of Congo": "DRC", "Cote d’Ivoire": "Côte d'Ivoire"}
REGIONS = [
    ("Coastal West Africa", ["Ghana", "Liberia", "Nigeria", "Togo"]),
    ("Sahel and Central Africa", ["Burkina Faso", "Chad", "Congo Brazzaville", "DRC"]),
    ("East Africa and Horn", ["Ethiopia", "Kenya", "Rwanda", "Somalia"]),
    ("Southern Africa", ["Mozambique", "South Africa", "Zambia", "Zimbabwe"]),
]

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def interviews(sav: Path) -> dict[str, dict[int, int]]:
    _, meta = pyreadstat.read_sav(str(sav), metadataonly=True)
    names = meta.variable_value_labels["QCOUNTRY"]
    df, _ = pyreadstat.read_sav(str(sav), usecols=["QCOUNTRY", "job"], apply_value_formats=False)
    out: dict[str, dict[int, int]] = {}
    for (job, code), count in df.groupby(["job", "QCOUNTRY"]).size().items():
        name = names[code]
        name = SEED_NAME.get(name, name)
        out.setdefault(name, {})[WAVE_OF_JOB[int(job)]] = int(count)
    return out


def sheet_rows(path: Path) -> list[dict[str, str]]:
    """Rows of the first sheet as {column letter: text}, with shared strings resolved.

    Standard library only. A cell with t="s" holds an INDEX into sharedStrings.xml, not a
    value; reading it raw is how "72" once appeared in the Angola row.
    """
    with zipfile.ZipFile(path) as z:
        shared = [
            "".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)
        ]
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.iter(f"{{{NS['m']}}}row"):
        cells = {}
        for c in row.findall("m:c", NS):
            col = re.match(r"[A-Z]+", c.get("r", "")).group(0)
            v = c.find("m:v", NS)
            if v is None or v.text is None:
                inline = c.find("m:is", NS)
                text = "".join(t.text or "" for t in inline.iter(f"{{{NS['m']}}}t")) if inline is not None else ""
            elif c.get("t") == "s":
                text = shared[int(v.text)]
            else:
                text = v.text
            cells[col] = text
        rows.append(cells)
    return rows


def tidy(text: str | None) -> str | None:
    """PSB's text with its whitespace collapsed; spelling untouched."""
    if text is None:
        return None
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def workbook(xlsx: Path) -> dict[str, dict[str, str | None]]:
    rows = sheet_rows(xlsx)
    head = rows[0]
    assert head.get("A") == "Country" and head.get("F") == "Languages Offered" and head.get("G") == "Locations Surveyed", head
    out = {}
    for row in rows[1:]:
        name = tidy(row.get("A"))
        if not name:
            continue
        out[name] = {"languages": tidy(row.get("F")), "locations": tidy(row.get("G"))}
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--sav", type=Path, default=DEFAULT_SAV)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_XLSX)
    args = parser.parse_args()

    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    seeded = {c["name"]: sorted(c["waves"]) for c in content["countries"]}
    counts = interviews(args.sav)
    counted = {name: sorted(w) for name, w in counts.items()}
    if counted != seeded:
        print("REFUSED: the file's country-waves differ from content.json's", file=sys.stderr)
        print(" file :", {k: v for k, v in counted.items() if seeded.get(k) != v}, file=sys.stderr)
        print(" seeds:", {k: v for k, v in seeded.items() if counted.get(k) != v}, file=sys.stderr)
        return 1
    wb = workbook(args.workbook)
    missing = set(seeded) - set(wb)
    if missing:
        print("REFUSED: workbook has no row for", sorted(missing), file=sys.stderr)
        return 1
    region_of = {c: name for name, members in REGIONS for c in members}
    countries = {}
    for name in sorted(seeded):
        countries[name] = {
            "interviews": {str(y): counts[name][y] for y in sorted(counts[name])},
            "languages": wb[name]["languages"],
            "locations": wb[name]["locations"],
            "region": region_of.get(name),
            "query": COUNTRY_QUERIES.get(name),
        }
    waves = {}
    for year in sorted(WAVE_OF_JOB.values()):
        waves[str(year)] = {
            "interviews": sum(c[year] for c in counts.values() if year in c),
            "published": PUBLISHED[year],
            "query": WAVE_QUERIES.get(year),
        }
    data = {
        "source": {
            "interviews": f"Unweighted rows of {args.sav.name}, by wave (job) and country (QCOUNTRY value label)",
            "languagesAndLocations": f"{args.workbook.name}, supplied by PSB on 28 September 2026, cell text as supplied with whitespace collapsed",
            "regions": "PSB's four 2026 regional groups, from their reply of 23 September 2026",
            "published": "PSB's published interview totals per wave; none published for 2026",
            "builtBy": "tools/build-fieldwork.py",
        },
        "waves": waves,
        "regions": [{"name": n, "countries": m} for n, m in REGIONS],
        "countries": countries,
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(w["interviews"] for w in waves.values())
    print(f"wrote {OUT.relative_to(ROOT)}: {len(countries)} countries, "
          f"{sum(len(c['interviews']) for c in countries.values())} country-waves, {total:,} interviews")
    print("waves:", {y: (w["interviews"], w["published"]) for y, w in waves.items()})
    print("languages awaited:", [n for n, c in countries.items() if c["languages"] is None])
    print("locations awaited:", [n for n, c in countries.items() if c["locations"] is None])
    print("queries:", [n for n, c in countries.items() if c["query"]], list(WAVE_QUERIES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
