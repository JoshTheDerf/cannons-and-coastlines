#!/usr/bin/env python3
"""Render the PRINTING.md that goes inside the STL zips.

The words live in nuxt-site/content/pages/print-guide.yml (the /print-guide
page reads the same file) and the assembly steps in the `assembly` block of
nuxt-site/content/pages/parts.yml. This only lays them out as Markdown, so the
site and the zips can't drift apart.

    print_guide.py set <set-id> [<dir>]      standalone guide for one set's zip
    print_guide.py bundle-top <folder>=<set-id>...
                                            top-level guide for the bundle zip
    print_guide.py bundle-fleet <set-id> [<dir>]
                                            one bundle folder's guide; points
                                            up to the top-level one

<dir> is the folder the zip is built from; its .stl/.svg/.3mf names are listed
under "Files". Output goes to stdout.

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

# Mirrors the fleet rows on nuxt-site/app/pages/print-guide.vue.
RIGGING_DEFAULT = "Brown masts, white sails"
RIGGING_MATCH = "Same color as the hull"


def load(name):
    with open(os.path.join(PAGES, name), encoding="utf-8") as f:
        return yaml.safe_load(f)


GUIDE = load("print-guide.yml")
PARTS = load("parts.yml")


def text(s):
    """Content fields are one-line strings; drop the YAML folding whitespace."""
    return re.sub(r"\s+", " ", str(s)).strip()


def fleets_for(set_id):
    fleets = [f for f in GUIDE["fleets"]["items"] if f["set"] == set_id]
    if not fleets:
        sys.exit(f"error: no fleet in print-guide.yml has set: {set_id}")
    return fleets


def fleet_rows(f):
    rows = []
    if f.get("hull"):
        rows.append(("Hull", f["hull"]))
    rows.append(("Masts and sails", RIGGING_MATCH if f.get("matchRigging") else RIGGING_DEFAULT))
    rows.extend((p, c) for p, c in f.get("parts", []))
    rows.append(("Supports", "On" if f.get("supports") else "Off"))
    rows.append(("Material", "PLA or PETG" if f.get("petg") else "PLA"))
    return rows


def table(header, rows):
    out = [f"| {header[0]} | {header[1]} |", "| --- | --- |"]
    out += [f"| {text(a)} | {text(b)} |" for a, b in rows]
    return "\n".join(out)


def settings_md():
    s, c = GUIDE["settings"], GUIDE["colors"]
    return "\n\n".join([
        f"## {s['title']}",
        table(("Setting", "Value"), s["rows"]),
        text(s["baseSet"]),
        f"## {c['title']}",
        table(("Part", "Color"), c["rows"]),
        text(c["note"]),
    ])


def fleet_md(f):
    return "\n\n".join([
        f"## {f['name']}",
        table(("Setting", "Value"), fleet_rows(f)),
        f"Online: {SITE}/print-guide#{f['id']}",
    ])


def assembly_md():
    a = PARTS["assembly"]
    out = [f"## {a['title']}", text(a["lead"])]
    for card in a["cards"]:
        out.append(f"### {card['title']}")
        if card.get("items"):
            mark = (lambda i: f"{i + 1}.") if card.get("ordered") else (lambda i: "-")
            out.append("\n".join(f"{mark(i)} {text(it)}" for i, it in enumerate(card["items"])))
        if card.get("body"):
            out.append(text(card["body"]))
    out.append(f"Every piece, with pictures: {SITE}/parts")
    return "\n\n".join(out)


def files_md(directory):
    if not directory:
        return None
    names = sorted(n for n in os.listdir(directory) if n.lower().endswith((".stl", ".svg", ".3mf")))
    return "## Files\n\n" + "\n".join(f"- {n}" for n in names)


def fleet_names(fleets):
    names = [f["name"] for f in fleets]
    return names[0] if len(names) == 1 else " and ".join([", ".join(names[:-1]), names[-1]])


def emit(parts):
    sys.stdout.write("\n\n".join(p for p in parts if p) + "\n")


def cmd_set(set_id, directory=None):
    fleets = fleets_for(set_id)
    emit([
        f"# Print guide: {fleet_names(fleets)}",
        f"The settings and colors for the files in this download. The online version is at {SITE}/print-guide.",
        settings_md(),
        *[fleet_md(f) for f in fleets],
        files_md(directory),
        assembly_md(),
    ])


def cmd_bundle_top(*pairs):
    index = []
    for pair in pairs:
        folder, _, set_id = pair.partition("=")
        index.append(f"- `{folder}/`: {fleet_names(fleets_for(set_id))}")
    emit([
        "# Print guide: every fleet",
        "One folder per fleet, each with its own PRINTING.md for the hull colors and supports. "
        f"The settings, part colors and assembly steps below apply to all of them. The online version is at {SITE}/print-guide.",
        "## Folders\n\n" + "\n".join(index),
        settings_md(),
        assembly_md(),
    ])


def cmd_bundle_fleet(set_id, directory=None):
    fleets = fleets_for(set_id)
    emit([
        f"# Print guide: {fleet_names(fleets)}",
        "The slicer settings, part colors and assembly steps for every fleet are in ../PRINTING.md. This is what's different for this folder.",
        *[fleet_md(f) for f in fleets],
        files_md(directory),
    ])


COMMANDS = {"set": cmd_set, "bundle-top": cmd_bundle_top, "bundle-fleet": cmd_bundle_fleet}

if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
