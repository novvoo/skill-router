import sys
from pathlib import Path
import importlib.util


def _load_cli_module():
    cli_path = Path(__file__).resolve().parent / "instinct-cli.py"
    spec = importlib.util.spec_from_file_location("instinct_cli", cli_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_windows_paths(mod):
    if not sys.platform.startswith("win"):
        return

    blocked = [
        r"C:\Windows\System32",
        r"C:\Program Files",
        r"C:\ProgramData",
        r"C:\System Volume Information",
    ]
    for p in blocked:
        try:
            mod._validate_file_path(p)
        except ValueError:
            pass
        else:
            raise AssertionError(f"expected ValueError for {p}")

    for p in [r"C:\\", r"\\server\share\out.yaml"]:
        try:
            mod._validate_file_path(p)
        except ValueError:
            pass
        else:
            raise AssertionError(f"expected ValueError for {p}")

    ok = Path(__file__).resolve().parent / "tmp-out.yaml"
    resolved = mod._validate_file_path(str(ok))
    assert resolved.is_absolute()


def main():
    mod = _load_cli_module()
    test_windows_paths(mod)
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
