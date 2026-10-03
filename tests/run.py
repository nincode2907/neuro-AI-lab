"""Chạy kiểm tra ES modules bằng Node >=16; app vẫn không cần build/package.json."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text()
ids = re.findall(r'id="([^"]+)"', html)
assert len(ids) == len(set(ids)), "ID DOM bị trùng"
for source in (root / "js").rglob("*.js"):
    text = source.read_text()
    for ref in re.findall(r"getElementById\('([^']+)'\)", text):
        assert ref in ids, f"Thiếu DOM #{ref} trong {source}"
    for ref in re.findall(r"from\s+['\"]([^'\"]+)['\"]", text):
        if ref.startswith("."):
            assert (source.parent / ref).is_file(), f"Import hỏng: {source}: {ref}"
print("PASS DOM IDs và imports", flush=True)
with tempfile.TemporaryDirectory(prefix="neuroai-tests-") as task_tmp:
    target = Path(task_tmp)
    shutil.copytree(root / "js", target / "js")
    shutil.copytree(root / "tests", target / "tests")
    (target / "package.json").write_text(json.dumps({"type": "module"}))
    for name, flags in [("phase1.mjs", []), ("lifecycle.mjs", ["--experimental-vm-modules", "--no-warnings"])]:
        result = subprocess.run(["node", *flags, str(target / "tests" / name)])
        if result.returncode:
            raise SystemExit(result.returncode)
