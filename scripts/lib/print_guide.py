#!/usr/bin/env python3
"""Render the PRINTING.md that goes inside the STL zips, and check a zip's files.

The words live in nuxt-site/content/pages/print-lists.yml (what to print),
print-guide.yml (settings and colors).
The /print-list and /print-guide pages and PRINTING.pdf
(rulebook/typst/print-list.typ) read the same files. This only lays them out
as Markdown, so the site and the zips can't drift apart.

    print_guide.py set <set-id> [<dir>]      standalone guide for one set's zip
    print_guide.py bundle-top <folder>=<set-id>...
                                            top-level guide for the bundle zip
    print_guide.py bundle-fleet <set-id> [<dir>]
                                            one bundle folder's guide; points
                                            up to the top-level one
    print_guide.py check <set-id> <dir>     fail if the print list names a file
                                            <dir> lacks; warn about model files
                                            in <dir> that no list mentions

<dir> is the folder the zip is built from (only `check` reads it). Output goes
to stdout.

Needs PyYAML. print_guide() in scripts/lib/common.sh runs this through uv when
the system python3 does not have it.
"""

import os
import re
import sys

import yaml

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAGES = os.path.join(REPO_ROOT, "nuxt-site", "content", "pages")
SITE = "https://cannonsandcoastlines.com"


def load(name):
    with open(os.path.join(PAGES, name), encoding="utf-8") as f:
        return yaml.safe_load(f)


GUIDE = load("print-guide.yml")
LISTS = load("print-lists.yml")
BASE_SET = LISTS["base"]["set"]


def text(s):
    """Content fields are one-line strings; drop the YAML folding whitespace."""
    return re.sub(r"\s+", " ", str(s)).strip()


def fleets_for(set_id):
    fleets = [f for f in GUIDE["fleets"]["items"] if f["set"] == set_id]
    if not fleets:
        sys.exit(f"error: no fleet in print-guide.yml has set: {set_id}")
    return fleets


def list_for(fleet_id):
    for lf in LISTS["fleets"]["items"]:
        if lf["id"] == fleet_id:
            return lf
    sys.exit(f"error: print-lists.yml has no fleet {fleet_id}")


def color_of(key, f=None):
    """Mirrors color-of() in rulebook/typst/print-list.typ."""
    if key == "hull" or (f and f.get("matchRigging") and key in ("masts", "sails")):
        return f["hull"]
    for r in GUIDE["colors"]["rows"]:
        if r["id"] == key:
            return r["color"]
    sys.exit(f"error: print-guide.yml colors has no id {key}")


def table(header, rows):
    out = [f"| {header[0]} | {header[1]} |", "| --- | --- |"]
    out += [f"| {text(a)} | {text(b)} |" for a, b in rows]
    return "\n".join(out)


def parts_md(items, lf=None, gf=None, mark_base=False):
    out = ["| Part | File | Qty | Color | Supports | Notes |", "| --- | --- | --- | --- | --- | --- |"]
    for it in items:
        qty = it["each"] * lf["ships"] if "each" in it else it["qty"]
        name = text(it["part"])
        file = it["file"] + (" from the base set" if mark_base and it.get("base") else "")
        supports = "Yes" if it.get("supports") else "No"
        note = text(it.get("note", ""))
        out.append(f"| {name} | {file} | {qty} | {text(color_of(it['color'], gf))} | {supports} | {note} |")
    return "\n".join(out)


def settings_md():
    """Material from print-lists.yml, the rest from print-guide.yml. Supports
    are a column in each list."""
    rows = [("Material", LISTS["material"])]
    rows += [r for r in GUIDE["settings"]["rows"] if r[0] not in ("Material", "Supports")]
    return "## Settings\n\n" + table(("Setting", "Value"), rows)


def fleet_md(f):
    lf = list_for(f["id"])
    paid = f["set"] != BASE_SET
    out = [
        f"## {f['name']}",
        f"{lf['ships']} {lf['shipType']} with {lf['fittings']}.",
        parts_md(lf["parts"], lf, f, mark_base=paid),
    ]
    if paid:
        out.append(f"{text(LISTS['base']['body'])} Get it at {SITE}/print-list/{BASE_SET}")
    return "\n\n".join(out)


def general_md():
    g = LISTS["general"]
    return "\n\n".join([
        f"## {g['title']}",
        f"### {g['perPlayer']['title']}",
        parts_md(g["perPlayer"]["parts"]),
        f"### {g['perTable']['title']}",
        parts_md(g["perTable"]["parts"]),
    ])


def kit_md(has_base):
    k = LISTS["kit"]
    if has_base:
        return "\n\n".join([f"## {k['title']}", *(text(p) for p in k["body"])])
    return f"## {k['title']}\n\n{text(k['paid'])} {SITE}/print-list/{BASE_SET}"


def files_for(set_ids):
    """Every file on these lists, for the steps' `needs`."""
    fs = set()
    for f in LISTS["fleets"]["items"]:
        if f["set"] in set_ids:
            fs |= {p["file"] for p in f["parts"]}
    if BASE_SET in set_ids:
        for sec in ("perPlayer", "perTable"):
            for p in LISTS["general"][sec]["parts"]:
                fs |= set(p.get("files") or [p["file"]])
    return fs


def steps_md(set_ids):
    """Mirrors steps-section in rulebook/typst/print-list.typ."""
    here = files_for(set_ids)
    steps = [st for st in LISTS["steps"]["items"] if not st.get("needs") or here & set(st["needs"])]
    return f"## {LISTS['steps']['title']}\n\n" + "\n".join(f"{i + 1}. {text(st['text'])}" for i, st in enumerate(steps))


def links_md(set_id, fleets):
    shop = "/shop" if set_id not in {f["set"] for f in fleets} else (
        "/shop/base-set-files" if set_id == BASE_SET else f"/shop/{fleets[0]['id']}")
    guide = "/print-guide" + (f"#{fleets[0]['id']}" if len(fleets) == 1 else "")
    return f"The shop page is {SITE}{shop}, and the print guide is at {SITE}{guide}."


def fleet_names(fleets):
    names = [f["name"] for f in fleets]
    return names[0] if len(names) == 1 else " and ".join([", ".join(names[:-1]), names[-1]])


def emit(parts):
    sys.stdout.write("\n\n".join(p for p in parts if p) + "\n")


def cmd_set(set_id, directory=None):
    fleets = fleets_for(set_id)
    emit([
        f"# {fleet_names(fleets)} print list",
        "What to print from this download, and how. PRINTING.pdf has the same, with pictures. "
        f"Online: {SITE}/print-list/{set_id}",
        *[fleet_md(f) for f in fleets],
        general_md() if set_id == BASE_SET else None,
        settings_md(),
        steps_md({set_id}),
        kit_md(set_id == BASE_SET),
        links_md(set_id, fleets),
    ])


def cmd_bundle_top(*pairs):
    index = []
    set_ids = {pair.partition("=")[2] for pair in pairs}
    for pair in pairs:
        folder, _, set_id = pair.partition("=")
        index.append(f"- `{folder}/`: {fleet_names(fleets_for(set_id))}")
    emit([
        "# All fleets print list",
        "One folder per fleet, each with its own PRINTING.md listing what to print from it. "
        "PRINTING.pdf, next to this file, has every fleet's print list with pictures. "
        f"Online: {SITE}/print-list/all-fleets",
        "## Folders\n\n" + "\n".join(index),
        general_md(),
        settings_md(),
        steps_md(set_ids),
        kit_md(True),
    ])


def cmd_bundle_fleet(set_id, directory=None):
    fleets = fleets_for(set_id)
    emit([
        f"# {fleet_names(fleets)} print list",
        "The settings and steps are in ../PRINTING.md and ../PRINTING.pdf. This is what to print from this folder.",
        *[fleet_md(f) for f in fleets],
        general_md() if set_id == BASE_SET else None,
    ])


def cmd_check(set_id, directory):
    """The print list and the folder must agree about which files ship."""
    listed = set()
    for f in fleets_for(set_id):
        for it in list_for(f["id"])["parts"]:
            # A paid fleet's base-set parts ship in the base set, not here.
            if set_id == BASE_SET or not it.get("base"):
                listed |= set(it.get("files") or [it["file"]])
    if set_id == BASE_SET:
        # Parts the add-on fleets borrow (the Stone Fleet's barrels) ship here.
        for lf in LISTS["fleets"]["items"]:
            listed |= {it["file"] for it in lf["parts"] if it.get("base")}
        for sec in ("perPlayer", "perTable"):
            for it in LISTS["general"][sec]["parts"]:
                listed |= set(it.get("files") or [it["file"]])
        listed |= set(LISTS.get("extras", []))
    present = {n for n in os.listdir(directory) if n.lower().endswith((".stl", ".3mf"))}
    missing = sorted(listed - present - set(LISTS.get("extras", [])))
    if missing:
        sys.exit(f"error: print-lists.yml lists files that {directory} doesn't have: {', '.join(missing)}")
    for n in sorted(present - listed):
        print(f"warning: {set_id}: {n} ships in the zip but no print list mentions it "
              "(nuxt-site/content/pages/print-lists.yml)", file=sys.stderr)


COMMANDS = {"set": cmd_set, "bundle-top": cmd_bundle_top, "bundle-fleet": cmd_bundle_fleet, "check": cmd_check}

if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
