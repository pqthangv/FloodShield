import os
import sys
import tempfile
from pathlib import Path

# Use a throwaway database for every test run.
_tmp = tempfile.mkdtemp(prefix="floodshield-test-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(_tmp) / 'test.db'}"
os.environ["ADMIN_TOKEN"] = "test-admin"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
