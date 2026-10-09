warning: in the working copy of 'backend/tests/test_config.py', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/backend/config.py b/backend/config.py[m
[1mindex aad9805..386c4d1 100644[m
[1m--- a/backend/config.py[m
[1m+++ b/backend/config.py[m
[36m@@ -1,7 +1,10 @@[m
 import os[m
[32m+[m[32mimport re[m
 from pathlib import Path[m
 from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit[m
 from pydantic_settings import BaseSettings, SettingsConfigDict[m
[32m+[m[32mfrom sqlalchemy.engine import make_url[m
[32m+[m[32mfrom sqlalchemy.exc import ArgumentError[m
 [m
 BASE_DIR = Path(__file__).resolve().parent[m
 [m
[36m@@ -28,6 +31,8 @@[m [mclass Settings(BaseSettings):[m
 [m
 settings = Settings()[m
 [m
[32m+[m[32m_POSTGRES_URL = re.compile(r"postgres(?:ql)?(?:\+\w+)?://[^\s'\"]+")[m
[32m+[m
 [m
 def normalized_database_url(url: str | None = None) -> str:[m
     """Accept the postgres:// URLs most hosts hand out and use the async driver.[m
[36m@@ -35,7 +40,21 @@[m [mdef normalized_database_url(url: str | None = None) -> str:[m
     Hosts such as Neon add libpq options (?sslmode=require&channel_binding=require) that[m
     asyncpg rejects: it calls the first one `ssl` and has no channel_binding option.[m
     """[m
[31m-    url = settings.database_url if url is None else url[m
[32m+[m[32m    url = (settings.database_url if url is None else url).strip()[m
[32m+[m[32m    # Dashboards also offer ready-made snippets such as psql 'postgresql://...' or[m
[32m+[m[32m    # DATABASE_URL="postgresql://...", and those get pasted too. Keep only the URL.[m
[32m+[m[32m    found = _POSTGRES_URL.search(url)[m
[32m+[m[32m    if found:[m
[32m+[m[32m        url = found.group(0)[m
[32m+[m[32m    try:[m
[32m+[m[32m        make_url(url)[m
[32m+[m[32m    except ArgumentError:[m
[32m+[m[32m        # Don't print the value: it contains the database password.[m
[32m+[m[32m        raise ValueError([m
[32m+[m[32m            f"DATABASE_URL is not a database address (value hidden, {len(url)} characters). "[m
[32m+[m[32m            "It must look like postgresql://user:password@host/dbname"[m
[32m+[m[32m        ) from None[m
[32m+[m
     if url.startswith("postgres://"):[m
         url = "postgresql+asyncpg://" + url[len("postgres://") :][m
     elif url.startswith("postgresql://"):[m
[1mdiff --git a/backend/tests/test_config.py b/backend/tests/test_config.py[m
[1mindex bba11fe..537eb3c 100644[m
[1m--- a/backend/tests/test_config.py[m
[1m+++ b/backend/tests/test_config.py[m
[36m@@ -1,3 +1,5 @@[m
[32m+[m[32mimport pytest[m
[32m+[m
 from config import normalized_database_url, public_base_url[m
 from database import connect_args_for[m
 [m
[36m@@ -15,6 +17,20 @@[m [mdef test_other_urls():[m
     assert normalized_database_url("sqlite+aiosqlite:///./store.db") == "sqlite+aiosqlite:///./store.db"[m
 [m
 [m
[32m+[m[32mdef test_pasted_snippets_are_reduced_to_the_url():[m
[32m+[m[32m    url = "postgresql://u:p@ep-x-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"[m
[32m+[m[32m    expected = "postgresql+asyncpg://u:p@ep-x-123.ap-southeast-1.aws.neon.tech/neondb?ssl=require"[m
[32m+[m[32m    for pasted in [f"psql '{url}'", f"DATABASE_URL='{url}'", f'"{url}"', f"  {url}\n"]:[m
[32m+[m[32m        assert normalized_database_url(pasted) == expected[m
[32m+[m
[32m+[m
[32m+[m[32mdef test_invalid_url_gives_a_clear_error_without_the_password():[m
[32m+[m[32m    for bad in ["", "me@example.com", "user:secret@host/db"]:[m
[32m+[m[32m        with pytest.raises(ValueError, match="DATABASE_URL is not a database address") as err:[m
[32m+[m[32m            normalized_database_url(bad)[m
[32m+[m[32m        assert "secret" not in str(err.value)[m
[32m+[m
[32m+[m
 def test_neon_pooled_url_skips_prepared_statement_cache():[m
     pooled = normalized_database_url("postgresql://u:p@ep-x-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require")[m
     args = connect_args_for(pooled)[m
