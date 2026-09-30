#!/usr/bin/env python3
"""Build ready-to-print 3MF projects from the print lists, one per fleet and color.

    npx jake print-plates                    # every group that changed
    scripts/print/build_print_plates.py --force
    PAID_SET_ROOT=../../paid-sets scripts/print/build_print_plates.py

For each fleet in nuxt-site/content/pages/print-lists.yml (and the base set's
islands, coins and terrain), the parts are grouped by the color they print in
(print-guide.yml), in the counts that list asks for. Each group becomes one
OrcaSlicer project 3MF: OrcaSlicer's CLI auto-orients the parts and arranges
them over as many 256 x 256 plates (Elegoo Centauri Carbon) as they need, with
scripts/print/presets/main.json (0.16 mm layers) plus Z contouring on. The
parts the list marks `supports` get supports as a per-object setting, so only
they do.

The CLI writes a separate copy of the mesh for every copy of a part. The 3MF is
rewritten so each file's mesh is stored once and every copy points at it (the
copies stay separate objects, since Orca's Z contouring won't slice an object
with several instances). CubbySlicer and desktop OrcaSlicer open the
result with its plates and settings.

Where the files go:
  - a group with only base-set files is public: assets/stls/plates/<name>.3mf
  - a group with any paid file goes to build/plates/<set-id>/<name>.3mf,
    which is gitignored and outside assets/ (served publicly). The paid zips
    and R2 are the only way out for those (scripts/build-paid-zips.sh).
  - nuxt-site/shared/data/print-plates.json lists every group for the
    /print-list pages, with a hash of what went in, so an unchanged group is
    not rebuilt (and the committed 3MFs don't churn).

Needs PyYAML and OrcaSlicer (ORCA=path, default `orca-slicer` or the
AppImage in ~/Downloads). ORCA_PROFILES points at Orca's resources/profiles
if it isn't found next to the binary.
"""

import argparse
import glob
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PAGES = os.path.join(REPO, "nuxt-site", "content", "pages")
SETS_JSON = os.path.join(REPO, "nuxt-site", "server", "data", "sets.json")
MANIFEST = os.path.join(REPO, "nuxt-site", "shared", "data", "print-plates.json")
BASE_DIR = os.path.join(REPO, "assets", "stls", "base-set")
PUBLIC_OUT = os.path.join(REPO, "assets", "stls", "plates")
PAID_OUT = os.environ.get("PLATES_PAID_OUT", os.path.join(REPO, "build", "plates"))
PAID_ROOT = os.environ.get("PAID_SET_ROOT", os.path.join(REPO, "paid-sets"))
PRESET = os.path.join(HERE, "presets", "main.json")

MACHINE = "Elegoo Centauri Carbon 0.4 nozzle"
FILAMENT = "Elegoo PLA @ECC"
# On top of presets/main.json. print-guide.yml: 0.16 mm, Z contouring on, 4 walls, 10%+ infill.
PROCESS_OVERRIDES = {"layer_height": "0.16", "zaa_enabled": "1", "wall_loops": "4"}
# Bump when the output format changes, to rebuild everything.
FORMAT = 1

# A filament color for each group, so the plate shows roughly the right color.
SWATCHES = [  # first match wins
    ("gold", "#D4AF37"), ("black", "#1E1E1E"), ("bright", "#9CFF3A"), ("translucent", "#CDE6EE"),
    ("rust", "#9A4A24"), ("pine", "#C9A26B"), ("blue-grey", "#9DB0C2"), ("pink", "#F2B8C6"),
    ("brown", "#7A4B2A"), ("white", "#F4F4F0"), ("green", "#5A8F4E"), ("grey", "#8C8C8C"),
]
ANY_SWATCH = "#C8C8C8"

# Paid output must never land in the public tree.
if os.path.realpath(PAID_OUT).startswith(os.path.realpath(os.path.join(REPO, "assets")) + os.sep):
    sys.exit(f"error: PLATES_PAID_OUT ({PAID_OUT}) is under assets/, which is served publicly")


def load(name):
    with open(os.path.join(PAGES, name), encoding="utf-8") as f:
        return yaml.safe_load(f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def plain(s):
    return re.sub(r"\s+", " ", re.sub(r"\*+", "", str(s))).strip()


def count(q):
    """'1–2' → 2, '1 each' → 1, 4 → 4. A range prints its top end."""
    nums = re.findall(r"\d+", str(q))
    return int(nums[-1]) if nums else 1


def short_color(c):
    """'Something bright, like neon green or orange' → 'Something bright'."""
    return plain(c).split(", like")[0]


def swatch(color):
    c = color.lower()
    if c.startswith("any"):
        return ANY_SWATCH
    for key, hex_ in SWATCHES:
        if key in c:
            return hex_
    return ANY_SWATCH


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Groups ──────────────────────────────────────────────────────────────

def groups():
    guide, lists = load("print-guide.yml"), load("print-lists.yml")
    with open(SETS_JSON, encoding="utf-8") as f:
        paid_sets = {s["id"] for s in json.load(f)["sets"] if s["paid"]}
    rows = {r["id"]: r["color"] for r in guide["colors"]["rows"]}
    gfleets = {f["id"]: f for f in guide["fleets"]["items"]}
    base = lists["base"]["set"]

    def color_of(key, gf):
        if gf and (key == "hull" or (gf.get("matchRigging") and key in ("masts", "sails"))):
            return gf["hull"]
        return rows[key]

    def group_parts(key, set_id, parts, gf, ships, prefix):
        out = {}
        for p in parts:
            color = plain(color_of(p["color"], gf))
            if color.lower() == "anything":
                color = "Any"
            files = p.get("files") or [p["file"]]
            total = p["each"] * ships if "each" in p else count(p["qty"])
            # Coins: the note gives the split ("5 Brace for Impact, 2 Full Sail, ...").
            split = [int(n) for n in re.findall(r"\d+", p.get("note", ""))] if len(files) > 1 else []
            if len(split) != len(files) or sum(split) != total:
                split = [total if len(files) == 1 else count(p["qty"])] * len(files)
            free = set_id == base or bool(p.get("base"))
            # In the fleet's own color (a hull, or rigging that matches it).
            own = color_of(p["color"], gf) != rows.get(p["color"])
            g = out.setdefault(color, {"color": color, "parts": [], "items": [], "paid": False})
            # How many the list asks for: 20 coins, but 1 wind dial (of four pieces).
            n_list = sum(split) if len(files) == 1 or split != [count(p["qty"])] * len(files) else count(p["qty"])
            g["parts"].append({"part": plain(p["part"]), "qty": n_list, "own": own,
                               "supports": bool(p.get("supports"))})
            for fname, n in zip(files, split):
                src = os.path.join(BASE_DIR if free else os.path.join(PAID_ROOT, set_id), fname)
                g["items"].append({"file": fname, "src": src, "count": n, "supports": bool(p.get("supports")),
                                   "own": own or not free})
            if not free:
                g["paid"] = True
        for g in out.values():
            g["key"] = key
            g["set"] = set_id if g["paid"] else base
            if g["paid"] and set_id not in paid_sets:
                sys.exit(f"error: {key} has paid parts but {set_id} isn't a paid set")
            if g["paid"] or any(it["file"].startswith("ship-") for it in g["items"]):
                # Named after its first part: treasure-fleet-hull, treasure-fleet-sail.
                g["name"] = f"{prefix}-{slug(g['parts'][0]['part'])}"
            else:
                # Only shared base-set parts: named by what's in it, so fleets
                # that need the same parts share one file.
                g["name"] = "-".join(f"{slug(pt['part'])}-{pt['qty']}" for pt in g["parts"])
            g["label"] = short_color(g["color"])
            yield g

    shared = {}
    for lf in lists["fleets"]["items"]:
        for g in group_parts(lf["id"], lf["set"], lf["parts"], gfleets[lf["id"]], lf["ships"], lf["id"]):
            g["own"] = g["paid"] or g["name"].startswith(lf["id"] + "-")
            items = [it for it in g["items"] if not it.pop("own")]
            parts = [pt for pt in g["parts"] if not pt.pop("own")]
            yield g
            # The base-set parts every fleet shares (masts, cargo, cannons,
            # wheels, cannonballs), all fleets together, for the all-fleets list.
            if not items:
                continue
            a = shared.setdefault(g["color"], {"color": g["color"], "parts": {}, "items": {}})
            for pt in parts:
                a["parts"][pt["part"]] = a["parts"].get(pt["part"], 0) + pt["qty"]
                a.setdefault("supports", set()).update([pt["part"]] if pt["supports"] else [])
            for it in items:
                k = (it["file"], it["supports"])
                a["items"].setdefault(k, dict(it, count=0))["count"] += it["count"]
    for a in shared.values():
        yield {"key": "all-fleets", "set": base, "paid": False, "own": True, "color": a["color"],
               "label": short_color(a["color"]), "name": f"all-fleets-{slug(next(iter(a['parts'])))}",
               "parts": [{"part": k, "qty": v, "supports": k in a.get("supports", ())} for k, v in a["parts"].items()],
               "items": list(a["items"].values())}
    gen = lists["general"]
    for g in group_parts("general", base, gen["perPlayer"]["parts"] + gen["perTable"]["parts"], None, 0, "game"):
        for x in g["items"] + g["parts"]:
            x.pop("own")
        yield g


# ── Orca ────────────────────────────────────────────────────────────────

def find_orca():
    exe = os.environ.get("ORCA")
    if not exe:
        exe = shutil.which("orca-slicer") or shutil.which("OrcaSlicer")
    if not exe:
        imgs = sorted(glob.glob(os.path.expanduser("~/Downloads/OrcaSlicer*.AppImage")))
        exe = imgs[-1] if imgs else None
    if not exe:
        sys.exit("error: OrcaSlicer not found (set ORCA=/path/to/orca-slicer)")
    return exe


def find_profiles(exe):
    cands = [os.environ.get("ORCA_PROFILES", "")]
    real = os.path.realpath(exe)
    cands += [os.path.join(os.path.dirname(real), "..", "resources", "profiles"),
              os.path.join(os.path.dirname(real), "resources", "profiles")]
    cands += glob.glob("/opt/orca-slicer*/resources/profiles") + ["/usr/share/OrcaSlicer/resources/profiles",
                                                                    os.path.expanduser("~/.cache/orcaslicer-resources/profiles")]
    for c in cands:
        if c and os.path.isdir(os.path.join(c, "Elegoo")):
            return os.path.abspath(c)
    sys.exit("error: OrcaSlicer's profiles not found (set ORCA_PROFILES=.../resources/profiles)")


class Profiles:
    def __init__(self, root):
        self.idx = {}
        for p in glob.glob(os.path.join(root, "Elegoo", "**", "*.json"), recursive=True) + \
                glob.glob(os.path.join(root, "OrcaFilamentLibrary", "**", "*.json"), recursive=True):
            try:
                with open(p, encoding="utf-8") as f:
                    name = json.load(f).get("name")
            except (OSError, ValueError):
                continue
            if name:
                self.idx.setdefault(name, p)

    def flat(self, cfg):
        """Walk `inherits`. Orca's CLI wants whole profiles, not diffs."""
        cfg = dict(cfg)
        parent = cfg.pop("inherits", None)
        if parent:
            if parent not in self.idx:
                sys.exit(f"error: Orca profile not found: {parent}")
            with open(self.idx[parent], encoding="utf-8") as f:
                merged = self.flat(json.load(f))
            merged.update(cfg)
            cfg = merged
        return cfg

    def named(self, name):
        with open(self.idx[name], encoding="utf-8") as f:
            return self.flat(json.load(f))


def settings(profiles, tmp):
    """(machine, process, filament) paths for the CLI, and the process keys that
    differ from its system preset (Orca's different_settings_to_system)."""
    with open(PRESET, encoding="utf-8") as f:
        preset = json.load(f)
    system_name = preset["inherits"]
    system = profiles.named(system_name)
    process = profiles.flat(preset)
    process.update(PROCESS_OVERRIDES)
    # Keep the system preset's name so a slicer can select it, with our changes on top.
    process.update({"name": system_name, "from": "system"})
    diff = sorted(k for k, v in process.items()
                  if k not in ("name", "from", "type", "setting_id", "instantiation", "inherits") and system.get(k) != v)
    paths = []
    for kind, cfg in (("machine", profiles.named(MACHINE)), ("process", process), ("filament", profiles.named(FILAMENT))):
        cfg["from"] = "system"
        p = os.path.join(tmp, f"{kind}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=1)
        paths.append(p)
    return paths, diff, process


def run_orca(exe, cfg_paths, files, out_dir):
    machine, process, filament = cfg_paths
    cmd = [exe, *files, "--load-settings", f"{process};{machine}", "--load-filaments", filament,
           "--orient", "1", "--arrange", "1", "--allow-rotations", "--ensure-on-bed",
           "--outputdir", out_dir, "--export-3mf", "orca.3mf"]
    r = subprocess.run(cmd, cwd=out_dir, capture_output=True, text=True)
    out = os.path.join(out_dir, "orca.3mf")
    if r.returncode != 0 or not os.path.exists(out):
        sys.stderr.write(r.stdout[-3000:] + r.stderr[-3000:])
        sys.exit(f"error: OrcaSlicer failed ({r.returncode})")
    return out


# ── 3MF rewrite ─────────────────────────────────────────────────────────

NS = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02",
      "p": "http://schemas.microsoft.com/3dmanufacturing/production/2015/06"}
P_PATH = "{%s}path" % NS["p"]
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def esc(s):
    return (str(s).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;"))


def rewrite(src, dest, group, diff):
    """One stored mesh per file, plate names, supports per object and the
    project settings a slicer needs to pick our changes up."""
    zin = zipfile.ZipFile(src)
    root = ET.fromstring(zin.read("3D/3dmodel.model"))
    comps = {}
    for obj in root.find("m:resources", NS).findall("m:object", NS):
        c = obj.find("m:components/m:component", NS)
        comps[obj.get("id")] = (c.get(P_PATH), c.get("objectid"), c.get("transform"))
    items = [(it.get("objectid"), it.get("transform"), it.get("printable", "1"))
             for it in root.find("m:build", NS).findall("m:item", NS)]

    cfg = ET.fromstring(zin.read("Metadata/model_settings.config"))
    source = {}
    parts_meta = {}
    for obj in cfg.findall("object"):
        oid = obj.get("id")
        part = obj.find("part")
        meta = {m.get("key"): m.get("value") for m in part.findall("metadata")}
        source[oid] = meta.get("source_file") or meta.get("name")
        parts_meta[oid] = meta
    plates = []
    for pl in cfg.findall("plate"):
        insts = [(mi.find("metadata[@key='object_id']").get("value")) for mi in pl.findall("model_instance")]
        plates.append(insts)

    supports = {it["file"] for it in group["items"] if it["supports"]}
    # Every copy stays its own object (Orca's Z contouring refuses an object
    # with several instances), but they all point at one stored mesh.
    mesh_path = {}  # source file -> (path in the new 3MF, mesh object id there)
    new_id = {}  # old object id -> new object id
    files = {}
    rels = []
    res, build, mcfg = [], [], []
    for n, (oid, tf, printable) in enumerate(items, 1):
        name = source[oid]
        path, sub_id, ctf = comps[oid]
        if name not in mesh_path:
            new_path = f"/3D/Objects/{re.sub(r'[^\w.-]', '_', name)}.model"
            files[new_path.lstrip("/")] = zin.read(path.lstrip("/"))
            rels.append(f' <Relationship Target="{new_path}" Id="rel-{len(rels) + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>')
            mesh_path[name] = (new_path, sub_id)
        new_path, mesh_id = mesh_path[name]
        new_id[oid] = 2 * n
        res.append(f'  <object id="{2 * n}" p:UUID="{n:08x}-61cb-4c03-9d28-80fed5dfa1dc" type="model">\n'
                   f'   <components>\n'
                   f'    <component p:path="{new_path}" objectid="{mesh_id}" p:UUID="{n:04x}0000-b206-40ff-9872-83e8017abed1" transform="{ctf}"/>\n'
                   f'   </components>\n  </object>')
        pm = "\n".join(f'      <metadata key="{esc(key)}" value="{esc(v)}"/>' for key, v in parts_meta[oid].items())
        extra = '\n    <metadata key="enable_support" value="1"/>' if name in supports else ""
        mcfg.append(f'  <object id="{2 * n}">\n    <metadata key="name" value="{esc(name)}"/>\n'
                    f'    <metadata key="extruder" value="1"/>{extra}\n'
                    f'    <part id="{mesh_id}" subtype="normal_part">\n{pm}\n    </part>\n  </object>')
        build.append(f'  <item objectid="{2 * n}" p:UUID="{n:08x}-b1ec-4553-aec9-835e5b724bb4" transform="{tf}" printable="{printable}"/>')

    plate_xml = []
    for i, insts in enumerate(plates, 1):
        mi = "\n".join(f'    <model_instance>\n      <metadata key="object_id" value="{new_id[o]}"/>\n'
                       f'      <metadata key="instance_id" value="0"/>\n    </model_instance>' for o in insts)
        pname = group["label"] if len(plates) == 1 else f"{group['label']} {i}"
        plate_xml.append(f'  <plate>\n    <metadata key="plater_id" value="{i}"/>\n'
                         f'    <metadata key="plater_name" value="{esc(pname)}"/>\n'
                         f'    <metadata key="locked" value="false"/>\n{mi}\n  </plate>')

    head = zin.read("3D/3dmodel.model").decode("utf-8")
    head = head[:head.index("<resources>")]
    title = f"{group['title']}: {group['label']}"
    head = head.replace("<metadata name=\"Title\"></metadata>", f"<metadata name=\"Title\">{esc(title)}</metadata>")
    model = (head + "<resources>\n" + "\n".join(res) + "\n </resources>\n <build>\n" + "\n".join(build) + "\n </build>\n</model>\n")
    files["3D/3dmodel.model"] = model.encode("utf-8")
    files["3D/_rels/3dmodel.model.rels"] = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
                                            + "\n".join(rels) + "\n</Relationships>\n").encode("utf-8")
    files["_rels/.rels"] = ('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
                            ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
                            "</Relationships>\n").encode("utf-8")
    files["Metadata/model_settings.config"] = ('<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + "\n".join(mcfg) + "\n"
                                               + "\n".join(plate_xml) + "\n</config>\n").encode("utf-8")

    ps = json.loads(zin.read("Metadata/project_settings.config"))
    ps["filament_colour"] = [swatch(group["color"])]
    # [process, filament, printer]: the process keys we changed from its system preset.
    n_fil = len(ps.get("filament_settings_id", [""]))
    ps["different_settings_to_system"] = [";".join(diff)] + [""] * n_fil + [""]
    files["Metadata/project_settings.config"] = json.dumps(ps, indent=4, sort_keys=True).encode("utf-8")
    for keep in ("[Content_Types].xml", "Metadata/slice_info.config"):
        if keep in zin.namelist():
            files[keep] = zin.read(keep)

    tmp = dest + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model", "3D/_rels/3dmodel.model.rels"] + \
                sorted(n for n in files if n.startswith("3D/Objects/")) + sorted(n for n in files if n.startswith("Metadata/")):
            if name in files:
                z.writestr(zipfile.ZipInfo(name, ZIP_DATE), files[name], zipfile.ZIP_DEFLATED)
    os.replace(tmp, dest)
    return len(plates), len(items)


# ── Main ────────────────────────────────────────────────────────────────

def files_for(set_id):
    """The 3MFs that go in a zip's plates/ folder: every group of the set's
    fleets (the base set's also has the islands, coins and terrain), or the
    all-fleets groups."""
    lists = load("print-lists.yml")
    base = lists["base"]["set"]
    if set_id == "all-fleets":
        keys = {"all-fleets"}
    else:
        keys = {f["id"] for f in lists["fleets"]["items"] if f["set"] == set_id}
        if set_id == base:
            keys.add("general")
    if not keys:
        sys.exit(f"error: no print list for {set_id}")
    with open(MANIFEST, encoding="utf-8") as f:
        groups = json.load(f)["groups"]
    seen = []
    for g in groups:
        if g["fleet"] not in keys:
            continue
        path = os.path.join(PAID_OUT, g["set"], g["file"]) if g["paid"] else os.path.join(PUBLIC_OUT, g["file"])
        if not os.path.exists(path):
            sys.exit(f"error: {os.path.relpath(path, REPO)} isn't built (npx jake print-plates)")
        if path not in seen:
            seen.append(path)
    print("\n".join(seen))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true", help="rebuild every group")
    ap.add_argument("--only", help="build only groups whose name contains this")
    ap.add_argument("--files-for", metavar="ID",
                    help="print the 3MFs for one set's zip (or all-fleets), from the manifest, and exit")
    args = ap.parse_args()
    if args.files_for:
        return files_for(args.files_for)

    names = {f["id"]: f["name"] for f in load("print-guide.yml")["fleets"]["items"]}
    names["general"] = "Islands, coins and terrain"
    names["all-fleets"] = "All fleets"
    old = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            old = {(g["fleet"], g["file"]): g for g in json.load(f).get("groups", [])}
    with open(PRESET, "rb") as f:
        preset_hash = hashlib.sha256(f.read() + json.dumps(PROCESS_OVERRIDES, sort_keys=True).encode()).hexdigest()

    exe = profiles = None
    tmp = tempfile.mkdtemp(prefix="print-plates-")
    cfg_paths = diff = None
    out_groups = []
    done = {}  # file -> (plates, objects, hash), for groups two fleets share
    built = kept = skipped = 0
    os.makedirs(PUBLIC_OUT, exist_ok=True)
    try:
        for g in groups():
            g.setdefault("own", True)
            g["title"] = names[g["key"]] if g["own"] and g["key"] != "general" else "Cannons and Coastlines"
            fname = g["name"] + ".3mf"
            dest_dir = os.path.join(PAID_OUT, g["set"]) if g["paid"] else PUBLIC_OUT
            dest = os.path.join(dest_dir, fname)
            entry = {"fleet": g["key"], "file": fname, "set": g["set"], "paid": g["paid"], "own": g["own"],
                     "color": g["color"], "label": g["label"], "swatch": swatch(g["color"]), "parts": g["parts"]}
            prev = old.get((g["key"], fname))
            missing = [it["src"] for it in g["items"] if not os.path.exists(it["src"])]
            if missing:
                if not prev:
                    sys.exit(f"error: {fname}: missing {', '.join(missing)} (PAID_SET_ROOT=/path/to/paid-sets?)")
                print(f"skip  {fname} (no {os.path.basename(missing[0])} here; kept its manifest entry)")
                out_groups.append(prev)
                skipped += 1
                continue
            h = hashlib.sha256(json.dumps({
                "format": FORMAT, "preset": preset_hash, "machine": MACHINE, "filament": FILAMENT,
                "entry": {k: v for k, v in entry.items() if k != "fleet"}, "title": g["title"],
                "items": [[it["file"], it["count"], it["supports"], sha(it["src"])] for it in g["items"]],
            }, sort_keys=True).encode()).hexdigest()[:16]
            if fname in done:
                entry.update(done[fname])
                out_groups.append(entry)
                continue
            if args.only and args.only not in fname:
                if prev:
                    out_groups.append(prev)
                continue
            if not args.force and prev and prev.get("hash") == h and os.path.exists(dest):
                done[fname] = {k: prev[k] for k in ("plates", "objects", "hash")}
                out_groups.append(prev)
                kept += 1
                continue
            if exe is None:
                exe = find_orca()
                profiles = Profiles(find_profiles(exe))
                cfg_paths, diff, _ = settings(profiles, tmp)
            work = tempfile.mkdtemp(dir=tmp)
            srcs = [it["src"] for it in g["items"] for _ in range(it["count"])]
            orca_out = run_orca(exe, cfg_paths, srcs, work)
            os.makedirs(dest_dir, exist_ok=True)
            plates, objects = rewrite(orca_out, dest, g, diff)
            shutil.rmtree(work, ignore_errors=True)
            done[fname] = {"plates": plates, "objects": objects, "hash": h}
            entry.update(done[fname])
            out_groups.append(entry)
            where = os.path.relpath(dest, REPO)
            print(f"▸ {where}  {plates} plate{'s' if plates != 1 else ''}, {objects} parts, {os.path.getsize(dest) / 1048576:.1f} MB")
            built += 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # 3MFs no group names any more (so a stale one can't reach a zip or R2).
    if not args.only:
        listed = {os.path.join(PAID_OUT, g["set"], g["file"]) if g["paid"] else os.path.join(PUBLIC_OUT, g["file"])
                  for g in out_groups}
        for p in glob.glob(os.path.join(PUBLIC_OUT, "*.3mf")) + glob.glob(os.path.join(PAID_OUT, "*", "*.3mf")):
            if p not in listed:
                os.remove(p)
                print(f"rm    {os.path.relpath(p, REPO)}")

    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({
            "_comment": "Written by scripts/print/build_print_plates.py (npx jake print-plates). "
                        "One OrcaSlicer project 3MF per fleet and color. Free ones are at /assets/stls/plates/<file>; "
                        "paid ones are only in the paid zips and R2 (<set>/v<version>/plates/<file>).",
            "groups": out_groups,
        }, f, indent=1)
        f.write("\n")
    print(f"Done: {built} built, {kept} unchanged, {skipped} skipped.")


if __name__ == "__main__":
    main()
