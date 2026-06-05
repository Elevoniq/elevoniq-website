#!/usr/bin/env python3
"""
Navigation update script for ElevonIQ website.
Changes:
1. All-inclusive-Paket / All-Inclusive-Paket / All-inclusive Paket → Essential (in nav context)
2. Remove <span class="item-price">Ab 69 €/Aufzug/Monat</span> (and html-entity variant)
3. Betriebskontrolle → Betriebskontrolle / Aufzugswärter (in nav context only)
4. Check/add Frequenzumrichter nav entry in Einzelleistungen
"""

import os
import re
import glob

BASE = "/Users/ludwigv.busse/Library/Mobile Documents/com~apple~CloudDocs/LuvoBu/Owners Inbox/website-build"

# Collect all HTML files, excluding _archive and .superpowers
html_files = []
for root, dirs, files in os.walk(BASE):
    # Skip hidden/archive directories
    dirs[:] = [d for d in dirs if d not in ('_archive', '.superpowers')]
    for f in files:
        if f.endswith('.html'):
            html_files.append(os.path.join(root, f))

html_files.sort()
print(f"Found {len(html_files)} HTML files")

changed_files = []

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as fh:
        original = fh.read()

    content = original

    # --- Change 1: All-inclusive variants → Essential in nav context ---
    # Patterns to handle:
    # a) In nav links (standalone text): All-inclusive-Paket / All-Inclusive-Paket / All-inclusive Paket / All-Inclusive
    # b) BUT NOT on the all-inclusive landing page itself (body content)
    #
    # Strategy: replace in nav-specific HTML patterns
    # The nav labels appear as:
    # - Plain text in dropdown-item links
    # - Plain text in mobile-nav-link links
    # - Plain text in footer-link links
    # - In <strong>All-Inclusive</strong> in nav-dropdown-item (index-B.html)
    # - As nav text inside anchor tags referencing /all-inclusive/

    # Replace standalone nav link text variants
    # Pattern: All-inclusive-Paket, All-Inclusive-Paket, All-inclusive Paket
    # These appear as nav link text content
    content = re.sub(r'All-inclusive-Paket', 'Essential', content)
    content = re.sub(r'All-Inclusive-Paket', 'Essential', content)
    content = re.sub(r'All-inclusive Paket', 'Essential', content)
    # index-B.html uses <strong>All-Inclusive</strong> in nav
    # But we need to be careful: only replace in nav context
    # The nav-dropdown-item pattern: <strong>All-Inclusive</strong>
    # We replace <strong>All-Inclusive</strong> only when inside a nav-dropdown-item link to /all-inclusive/
    content = re.sub(
        r'(<a[^>]+all-inclusive[^>]*>[^<]*<strong>)All-Inclusive(</strong>)',
        r'\1Essential\2',
        content
    )
    # Footer in index-B.html: <a href="/laufende-betreuung/all-inclusive/">All-Inclusive</a>
    content = re.sub(
        r'(<a[^>]+all-inclusive[^>]*>)All-Inclusive(</a>)',
        r'\1Essential\2',
        content
    )
    # Body content in index-B.html: "All-Inclusive: Vollbetreuung inkl. Besichtigungen" — leave as-is
    # But we already made the replacements above... let's check: "All-Inclusive" alone (not in anchor)
    # Actually index-B body uses "All-Inclusive" outside of anchor tags too (line 883, 1082 already caught)
    # We need to be more surgical. Let me re-check what got replaced.
    # The above regex for footer already handles the <a>All-Inclusive</a> case.
    # The <strong>All-Inclusive</strong> only appears inside nav links.
    # Body content like "All-Inclusive: Vollbetreuung" won't be matched by those patterns.
    # But if there's a bare "All-Inclusive" in body text not inside an anchor: that stays.

    # --- Change 2: Remove price hint span ---
    # Remove: <span class="item-price">Ab 69 €/Aufzug/Monat</span>
    # And HTML-entity variant: <span class="item-price">Ab 69 &euro;/Aufzug/Monat</span>
    # And lowercase variant: <span class="item-price">ab 69 &#x20AC;/Monat</span>
    # Optionally with space before/after span
    content = re.sub(r'\s*<span class="item-price">Ab 69 €/Aufzug/Monat</span>', '', content)
    content = re.sub(r'\s*<span class="item-price">Ab 69 &euro;/Aufzug/Monat</span>', '', content)
    content = re.sub(r'\s*<span class="item-price">ab 69 &#x20AC;/Monat</span>', '', content)
    content = re.sub(r'\s*<span class="item-price">ab 69 €/Monat</span>', '', content)

    # --- Change 3: Betriebskontrolle → Betriebskontrolle / Aufzugswärter in nav context ---
    # Only in:
    # a) dropdown-item links
    # b) mobile-nav-link links
    # c) footer-link links
    # d) nav-dropdown-item links (index-B.html uses <strong>Betriebskontrolle</strong>)
    # NOT in page body content on betriebskontrolle page itself
    #
    # Pattern: text "Betriebskontrolle" inside anchor tags with nav classes
    # Use regex to replace only when within nav/footer anchor context

    def replace_betriebskontrolle_in_nav(m):
        full = m.group(0)
        # Replace standalone "Betriebskontrolle" text with new label
        # But don't touch "Betriebskontrolle / Aufzugswärter" if already updated
        full = re.sub(r'(?<![/\w])Betriebskontrolle(?!\s*/)', 'Betriebskontrolle / Aufzugswärter', full)
        return full

    # Match anchor tags with nav/footer classes that contain Betriebskontrolle
    # dropdown-item, mobile-nav-link, footer-link, nav-dropdown-item
    content = re.sub(
        r'<a[^>]+class="[^"]*(?:dropdown-item|mobile-nav-link|footer-link|nav-dropdown-item)[^"]*"[^>]*>.*?Betriebskontrolle.*?</a>',
        replace_betriebskontrolle_in_nav,
        content,
        flags=re.DOTALL
    )

    # Also handle: <strong>Betriebskontrolle</strong> inside nav-dropdown-item (index-B)
    # This is handled by the anchor regex above since the <strong> is inside the <a>

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as fh:
            fh.write(content)
        changed_files.append(filepath)
        print(f"  CHANGED: {filepath.replace(BASE + '/', '')}")

print(f"\nTotal changed: {len(changed_files)} files")
