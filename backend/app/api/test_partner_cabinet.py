"""Functional contract of the partner cabinet.

The cabinet is 11 pages and 20 endpoints handling API tokens, product feeds and
embeddable widget keys, and it had no tests at all. These guard the two things
that break silently — nothing throws, nothing logs, the page just quietly shows
or does the wrong thing:

  1. An endpoint losing its partner gate. Every /api/partner/* handler must
     resolve the caller to an approved partner. Drop that and any authenticated
     user reads and revokes other companies' API tokens.

  2. A page calling an endpoint that no longer exists. A renamed route leaves the
     button in place; it just 404s when a partner clicks it.

Run it:  python3 -m app.api.test_partner_cabinet     (from backend/)

ponytail: static contract checks, no DB and no server. A real end-to-end suite
needs a throwaway Postgres and pytest, neither of which this repo has — that is
worth building, but its absence must not mean zero coverage in the meantime.
"""

import re
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2]
_REPO = _BACKEND.parent

_PARTNER_PY = (_BACKEND / "app" / "api" / "partner.py").read_text()
_PAGES = sorted((_REPO / "app" / "partner").rglob("*.tsx"))

# Router variable -> URL prefix it is mounted under in app/main.py.
_PREFIXES = {"router": "/api/partner", "admin_router": "/api/admin", "public_router": "/api/v1"}

# Public by contract: the widget VTON endpoint authenticates by API token, not by
# a logged-in partner session.
_PUBLIC = {("POST", "/api/v1/vton")}


def _handlers():
    """(router, method, path, body) for every route in partner.py."""
    chunks = re.split(r"\n(?=@(?:router|public_router|admin_router)\.)", _PARTNER_PY)
    for chunk in chunks[1:]:
        m = re.match(r'@(\w+)\.(\w+)\("([^"]*)"\)', chunk)
        if m:
            router, method, path = m.groups()
            yield router, method.upper(), _PREFIXES[router] + path, chunk


def test_every_partner_endpoint_resolves_a_partner():
    """No handler may act on partner data without first resolving WHICH partner."""
    for router, method, path, body in _handlers():
        if router != "router" or (method, path) in _PUBLIC:
            continue
        assert "_require_approved_partner" in body or "_get_partner" in body, (
            f"{method} {path} never resolves the caller to a partner — "
            f"any authenticated user can reach another company's data"
        )


def test_admin_partner_endpoints_require_admin():
    for router, method, path, body in _handlers():
        if router != "admin_router":
            continue
        head = body.split("async def", 1)[-1][:400]
        assert "get_admin_user" in head, f"{method} {path} is not admin-gated"


def test_resource_endpoints_check_ownership():
    """A partner must not touch another partner's token, feed or widget key.

    Ownership is enforced two ways in this file — scoped SQL (`AND partner_id =
    :pid`) or an explicit Python comparison against the resolved partner — so
    accept either. Accepting neither is the bug.
    """
    for router, method, path, body in _handlers():
        if router != "router" or "{" not in path:
            continue
        scoped_sql = re.search(r"partner_id\s*=\s*:", body)
        checked_in_python = re.search(r"\.partner_id\s*!=\s*partner\[", body)
        assert scoped_sql or checked_in_python, (
            f"{method} {path} takes an id from the URL and never checks who owns it"
        )


def test_pages_only_call_endpoints_that_exist():
    """A renamed route leaves the button in place and 404s on click."""
    known = {(m, _norm(p)) for _, m, p, _ in _handlers()}
    for path in ("/api/auth/register", "/api/auth/email-session"):  # owned by auth.py
        known.add(("POST", path))

    broken = []
    for page in _PAGES:
        text = page.read_text()
        calls = [(m.group(1).upper(), m.group(2))
                 for m in re.finditer(r"api\.(get|post|patch|delete|put)\(\s*[`\"']([^`\"']+)", text)]
        for m in re.finditer(r"fetch\(\s*[`\"']([^`\"']*/api/[^`\"']+)[`\"']([^)]{0,200})", text, re.S):
            verb = re.search(r'method:\s*["\'](\w+)', m.group(2))
            calls.append(((verb.group(1) if verb else "GET").upper(), m.group(1)))
        for method, url in calls:
            if (method, _norm(url)) not in known:
                broken.append(f"{method} {url}  <- {page.relative_to(_REPO)}")
    assert not broken, "pages call endpoints that do not exist:\n  " + "\n  ".join(broken)


def test_cabinet_uses_the_product_design_system():
    """The cabinet shipped in its own pink-to-blue identity while the product uses
    ink/signal/canvas. Semantic status colours (success, error, warning, syntax
    highlighting) are deliberately still allowed — they carry meaning, not brand."""
    offenders = []
    for page in _PAGES:
        text = page.read_text()
        for bad in re.findall(r"EC9DE2|89AEFF|bg-gradient-to-\w+", text):
            offenders.append(f"{page.relative_to(_REPO)}: {bad}")
        for bad in re.findall(r"(?:bg|text|border)-gray-\d{2,3}", text):
            offenders.append(f"{page.relative_to(_REPO)}: {bad} (use ink/canvas/line)")
    assert not offenders, "off-system styling:\n  " + "\n  ".join(sorted(set(offenders)))


def _norm(url: str) -> str:
    return re.sub(r"\$\{[^}]+\}", "{x}", re.sub(r"\{[^}]+\}", "{x}", url)).split("?")[0].rstrip("/")


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed — {sum(1 for _ in _handlers())} endpoints, {len(_PAGES)} pages")
