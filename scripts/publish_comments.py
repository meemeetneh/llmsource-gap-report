#!/usr/bin/env python3
"""Attach the review layer to the v9 report, then encrypt it for GitHub Pages.

Preview: python3 scripts/publish_comments.py --preview
Publish build: PAGE_PASSWORD=<set in shell> python3 scripts/publish_comments.py
"""
from pathlib import Path
import argparse
import hashlib
import os
import secrets
import subprocess
import tempfile
import json

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
ROOT = SITE.parent
SOURCE = ROOT / 'v9-share' / 'report.html'
TOKEN_FILE = SITE / '.private' / 'comments-token'


def access_token() -> str:
    TOKEN_FILE.parent.mkdir(exist_ok=True)
    if not TOKEN_FILE.exists():
        TOKEN_FILE.write_text(secrets.token_hex(32), encoding='ascii')
        TOKEN_FILE.chmod(0o600)
    token = TOKEN_FILE.read_text(encoding='ascii').strip()
    assert len(token) == 64 and all(c in '0123456789abcdef' for c in token), 'Invalid private comments token'
    return token


def attach_assets(html: str, base: str, token: str) -> str:
    assert '<doc-page' in html and '</x-dc>' in html, 'Unexpected report source'
    assert 'id="rg-header"' not in html and 'comments.js' not in html, 'Review layer already attached'
    def version(name: str) -> str:
        return hashlib.sha256((SITE / name).read_bytes()).hexdigest()[:10]
    return html + f'''
<link rel="stylesheet" href="{base}/comments.css?v={version('comments.css')}">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="{base}/comments-config.js?v={version('comments-config.js')}"></script>
<script>window.RG_COMMENTS_TOKEN = {json.dumps(token)};</script>
<script src="{base}/comments.js?v={version('comments.js')}"></script>
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true', help='Write unencrypted local preview outside the Pages repository')
    args = parser.parse_args()
    html = SOURCE.read_text(encoding='utf-8')
    token = access_token()
    if args.preview:
        output = ROOT / 'v9-share' / 'report-comments-preview.html'
        output.write_text(attach_assets(html, '../llmsource-gap-report', token), encoding='utf-8')
        print(f'Preview: {output}')
        return
    if not os.environ.get('PAGE_PASSWORD'):
        parser.error('Set PAGE_PASSWORD in the shell before building the encrypted page')
    config = SITE / 'comments-config.js'
    config_text = config.read_text(encoding='utf-8') if config.exists() else ''
    if not all(word in config_text for word in ('https://', 'publishableKey: ')) or 'YOUR-' in config_text:
        parser.error('Create comments-config.js with the Supabase Project URL and publishable key')
    with tempfile.NamedTemporaryFile('w', suffix='.html', encoding='utf-8', delete=False) as tmp:
        tmp.write(attach_assets(html, '.', token))
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(['node', str(ROOT / 'v9-source' / 'encrypt.mjs'), str(tmp_path), str(SITE / 'index.html')], check=True)
    finally:
        tmp_path.unlink(missing_ok=True)
    print(f'Encrypted page: {SITE / "index.html"}')


if __name__ == '__main__':
    main()
