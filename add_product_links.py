#!/usr/bin/env python3
"""
Interne Produktlinks einbauen — erste Erwähnung pro Seite verlinken.
Produkte: ELEVATOR HUB®, ELEVATOR LIVE, SMART FLAP®, Essentials Aufzugsmanagement

Ansatz: BeautifulSoup zum sicheren Parsen + Lokalisieren der Stelle,
dann gezielter String-Replace im Original-HTML (Formatierung bleibt erhalten).
"""

import os
import re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Tag

WEBSITE_ROOT = Path("/Users/ludwigv.busse/Library/Mobile Documents/com~apple~CloudDocs/LuvoBu/Owners Inbox/website-build")

# Produkte: (Name, Ziel-URL, eigene Seite — kein Link auf sich selbst)
PRODUCTS = [
    {
        "name": "ELEVATOR HUB",
        "url": "/laufende-betreuung/elevator-hub/",
        "own_page": "laufende-betreuung/elevator-hub/index.html",
    },
    {
        "name": "ELEVATOR LIVE",
        "url": "/laufende-betreuung/iot-monitoring/",
        "own_page": "laufende-betreuung/iot-monitoring/index.html",
    },
    {
        "name": "SMART FLAP",
        "url": "/laufende-betreuung/smart-flap/",
        "own_page": "laufende-betreuung/smart-flap/index.html",
    },
    {
        "name": "Essentials Aufzugsmanagement",
        "url": "/laufende-betreuung/all-inclusive/",
        "own_page": "laufende-betreuung/all-inclusive/index.html",
    },
]

# Selektoren für ausgeschlossene Zonen
EXCLUDED_TAG_NAMES = {"nav", "footer"}
EXCLUDED_CLASSES = {
    "nav-dropdown-menu",
    "mobile-nav-overlay",
    "site-nav",
    "page-hero",
}


def is_in_excluded_zone(tag):
    """Prüft ob ein Tag in Nav, Footer oder Hero liegt."""
    for parent in tag.parents:
        if not isinstance(parent, Tag):
            continue
        if parent.name in EXCLUDED_TAG_NAMES:
            return True
        parent_classes = set(parent.get("class", []))
        if parent_classes & EXCLUDED_CLASSES:
            return True
        # page-hero über Präfix
        for cls in parent_classes:
            if cls.startswith("page-hero"):
                return True
    return False


def already_in_anchor(tag):
    """Prüft ob ein Tag schon in einem <a>-Element liegt."""
    for parent in tag.parents:
        if isinstance(parent, Tag) and parent.name == "a":
            return True
    return False


def find_first_linkable_occurrence(soup, product_name):
    """
    Sucht die erste verknüpfbare Erwähnung eines Produktnamens im Body-Content.
    Gibt ein Dict zurück mit Infos zum gefundenen Textknoten, oder None.
    """
    for text_node in soup.body.find_all(string=True):
        if not isinstance(text_node, NavigableString):
            continue
        parent = text_node.parent
        if not isinstance(parent, Tag):
            continue
        if is_in_excluded_zone(parent):
            continue
        if already_in_anchor(text_node):
            continue

        text = str(text_node)
        idx = text.find(product_name)
        if idx == -1:
            continue

        # Prüfen ob unmittelbar danach ein <sup>® steht
        next_sib = text_node.next_sibling
        has_sup_reg = (
            isinstance(next_sib, Tag)
            and next_sib.name == "sup"
            and "®" in next_sib.get_text()
        )

        return {
            "text_node": text_node,
            "idx": idx,
            "has_sup_reg": has_sup_reg,
            "next_sib": next_sib if has_sup_reg else None,
        }

    return None


def apply_link_in_html(html, product_name, target_url, occurrence):
    """
    Baut den Link gezielt ins Original-HTML ein, ohne die Gesamtformatierung zu ändern.
    Arbeitet mit String-Ersetzung am Original-HTML.
    """
    text_node = occurrence["text_node"]
    idx = occurrence["idx"]
    has_sup_reg = occurrence["has_sup_reg"]

    original_text = str(text_node)
    before = original_text[:idx]
    after = original_text[idx + len(product_name):]

    if has_sup_reg:
        # Produkt + <sup>®</sup> zusammen verlinken
        # Das Original-HTML enthält z.B.: ...ELEVATOR HUB<sup>®</sup>...
        # Wir ersetzen: ELEVATOR HUB<sup>®</sup> → <a href="...">ELEVATOR HUB<sup>®</sup></a>
        # Varianten: mit und ohne Leerzeichen zwischen Text und sup

        # Baue den genauen Pattern: Produktname + optionaler Whitespace + <sup>®</sup>
        # Wir verwenden den exakten <sup>®</sup>-Tag-String aus dem Original
        sup_tag = occurrence["next_sib"]
        sup_html = str(sup_tag)  # z.B. "<sup>®</sup>"

        # Suche-Pattern: Produktname (nicht in <a>) + sup-Tag
        # Da wir wissen, dass diese Stelle im HTML vorkommt, suchen wir direkt
        search_str = product_name + sup_html
        replacement = f'<a href="{target_url}">{product_name}{sup_html}</a>'

    else:
        # Reiner Text-Link
        # Prüfen ob ® direkt im Text folgt
        if after.startswith("®"):
            search_str = product_name + "®"
            replacement = f'<a href="{target_url}">{product_name}®</a>'
        else:
            search_str = product_name
            replacement = f'<a href="{target_url}">{product_name}</a>'

    # Sicherheitscheck: search_str darf NICHT schon in einem <a>-Tag sein
    # Wir suchen die erste Stelle im HTML und prüfen den Kontext
    # Strategie: finde alle Vorkommen und ersetze nur das erste, das nicht in <a> ist

    result_html = replace_first_outside_anchor(html, search_str, replacement, excluded_zones=True)
    return result_html


def replace_first_outside_anchor(html, search_str, replacement, excluded_zones=True):
    """
    Ersetzt das erste Vorkommen von search_str im HTML,
    das NICHT innerhalb eines <a>...</a>-Tags und
    NICHT innerhalb einer ausgeschlossenen Zone liegt.
    Gibt das modifizierte HTML zurück (oder Original bei kein Match).
    """
    # Wir arbeiten mit einem zustandsbehafteten Parser
    # Ausgeschlossene Zonen: nav, footer, page-hero, mobile-nav-overlay, site-nav, nav-dropdown-menu
    # Strategie: Position des ersten Treffers finden, der nicht in einer ausgeschlossenen Zone liegt

    pos = 0
    while True:
        idx = html.find(search_str, pos)
        if idx == -1:
            break  # Nicht gefunden

        # Prüfen ob diese Position in einer ausgeschlossenen Zone liegt
        # Wir schauen uns den HTML-Text vor dieser Position an
        prefix = html[:idx]

        if is_in_excluded_zone_html(prefix, html, idx):
            pos = idx + 1
            continue

        if is_in_anchor_html(prefix):
            pos = idx + 1
            continue

        # Gefunden — ersetzen
        return html[:idx] + replacement + html[idx + len(search_str):]

    return html  # Kein ersetzbares Vorkommen gefunden


def is_in_anchor_html(prefix):
    """
    Prüft ob wir uns aktuell innerhalb eines geöffneten <a>-Tags befinden.
    Strategie: Zähle ungeclosed <a> Tags im Prefix.
    """
    # Öffnende <a ...> Tags (keine schließenden)
    opens = len(re.findall(r'<a\b[^>]*>', prefix))
    closes = len(re.findall(r'</a>', prefix))
    return opens > closes


def is_in_excluded_zone_html(prefix, html, pos):
    """
    Prüft ob Position `pos` in einer ausgeschlossenen Zone liegt.
    Ausgeschlossene Zonen: nav, footer, page-hero-Sektion, mobile-nav-overlay, site-nav, nav-dropdown-menu
    """
    # Für jede ausgeschlossene Zone: prüfen ob ein öffnendes Tag ohne schließendes Tag im Prefix liegt

    # nav
    if _is_in_tag_zone(prefix, "nav"):
        return True

    # footer
    if _is_in_tag_zone(prefix, "footer"):
        return True

    # Div-basierte Zonen: class-basiert
    # Wir suchen nach dem letzten offenen Tag mit einer der ausgeschlossenen Klassen
    for cls in EXCLUDED_CLASSES:
        if _is_in_class_zone(prefix, cls):
            return True

    # page-hero (Klassen-Präfix)
    if _is_in_page_hero_zone(prefix):
        return True

    return False


def _is_in_tag_zone(prefix, tag_name):
    """Prüft ob wir innerhalb eines <tag_name> sind."""
    opens = len(re.findall(rf'<{tag_name}\b[^>]*>', prefix))
    closes = len(re.findall(rf'</{tag_name}>', prefix))
    return opens > closes


def _is_in_class_zone(prefix, cls):
    """Prüft ob wir innerhalb eines Elements mit Klasse `cls` sind."""
    # Finde alle Tags die diese Klasse haben
    pattern = rf'<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\bclass=["\'][^"\']*\b{re.escape(cls)}\b[^"\']*["\'][^>]*>'
    tag_matches = list(re.finditer(pattern, prefix))
    if not tag_matches:
        return False

    # Das letzte Öffnungs-Tag mit dieser Klasse — ist es noch offen?
    last_match = tag_matches[-1]
    tag_start = last_match.start()
    tag_html = last_match.group(0)

    # Welcher Tag-Name ist das?
    tag_name_match = re.match(r'<([a-zA-Z][a-zA-Z0-9]*)', tag_html)
    if not tag_name_match:
        return False
    tag_name = tag_name_match.group(1)

    # Zähle Opens und Closes dieses Tag-Namens nach tag_start
    suffix_from_open = prefix[tag_start:]
    opens = len(re.findall(rf'<{tag_name}\b[^>]*>', suffix_from_open))
    closes = len(re.findall(rf'</{tag_name}>', suffix_from_open))
    return opens > closes


def _is_in_page_hero_zone(prefix):
    """Prüft ob wir in einem Element mit Klasse page-hero* sind."""
    pattern = r'<[a-zA-Z][a-zA-Z0-9]*\b[^>]*\bclass=["\'][^"\']*\bpage-hero[^"\']*["\'][^>]*>'
    tag_matches = list(re.finditer(pattern, prefix))
    if not tag_matches:
        return False

    last_match = tag_matches[-1]
    tag_start = last_match.start()
    tag_html = last_match.group(0)

    tag_name_match = re.match(r'<([a-zA-Z][a-zA-Z0-9]*)', tag_html)
    if not tag_name_match:
        return False
    tag_name = tag_name_match.group(1)

    suffix_from_open = prefix[tag_start:]
    opens = len(re.findall(rf'<{tag_name}\b[^>]*>', suffix_from_open))
    closes = len(re.findall(rf'</{tag_name}>', suffix_from_open))
    return opens > closes


def process_file(filepath):
    """Verarbeitet eine HTML-Datei und baut Produktlinks ein."""
    rel_path = str(filepath.relative_to(WEBSITE_ROOT)).replace("\\", "/")

    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # BeautifulSoup nur zum Lokalisieren der ersten verlinkbaren Stelle
    soup = BeautifulSoup(html, "html.parser")

    if not soup.body:
        return False, []

    linked_products = []

    for product in PRODUCTS:
        # Eigene Seite überspringen
        if rel_path == product["own_page"]:
            continue

        product_name = product["name"]

        # Schnell-Check: Kommt der Produktname überhaupt im Body vor?
        if product_name not in html:
            continue

        # BeautifulSoup: erste verlinkbare Stelle finden
        occurrence = find_first_linkable_occurrence(soup, product_name)
        if occurrence is None:
            continue

        # Link im Original-HTML einbauen (Formatierung bleibt erhalten)
        new_html = apply_link_in_html(html, product_name, product["url"], occurrence)

        if new_html != html:
            html = new_html
            linked_products.append(product_name)
            # Soup neu parsen für den nächsten Produkt-Durchgang (wichtig!)
            soup = BeautifulSoup(html, "html.parser")

    if not linked_products:
        return False, []

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)

    return True, linked_products


def get_html_files():
    """Alle relevanten HTML-Dateien (keine .superpowers, kein _archive)."""
    files = []
    for path in WEBSITE_ROOT.rglob("*.html"):
        rel = path.relative_to(WEBSITE_ROOT)
        parts = rel.parts
        if any(p.startswith(".") for p in parts):
            continue
        if any(p == "_archive" for p in parts):
            continue
        files.append(path)
    return sorted(files)


def main():
    html_files = get_html_files()
    print(f"Gefunden: {len(html_files)} HTML-Dateien\n")

    changed_files = []
    product_link_count = {}

    for filepath in html_files:
        changed, linked = process_file(filepath)
        if changed:
            rel = str(filepath.relative_to(WEBSITE_ROOT))
            changed_files.append(rel)
            for p in linked:
                product_link_count[p] = product_link_count.get(p, 0) + 1
            print(f"  [GEAENDERT] {rel}")
            print(f"             Links: {', '.join(linked)}")

    print(f"\n--- Zusammenfassung ---")
    print(f"Geaenderte Dateien: {len(changed_files)}")
    print(f"Links pro Produkt:")
    for product, count in sorted(product_link_count.items()):
        print(f"  {product}: {count} Seiten")

    if not changed_files:
        print("Keine Aenderungen notwendig.")


if __name__ == "__main__":
    main()
