"""Find comment lines sitting inside a backslash-continued command.

Bash joins a line ending in a backslash to the next one. When the next line is a
comment, the comment swallows the rest and the command ends there -- every flag
after it silently becomes its own failing command.
"""
import pathlib
import sys

BS = chr(92)
bad = 0
for path in sys.argv[1:]:
    lines = pathlib.Path(path).read_text(encoding="utf-8").split("\n")
    for i in range(len(lines) - 1):
        if lines[i].rstrip().endswith(BS) and lines[i + 1].strip().startswith("#"):
            print(f"{path}:{i + 2}  comment inside a continued command")
            print(f"    {i + 1}: {lines[i].strip()[:80]}")
            print(f"    {i + 2}: {lines[i + 1].strip()[:80]}")
            bad += 1
print(f"\n{bad} break(s) found")
sys.exit(1 if bad else 0)
