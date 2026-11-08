#!/usr/bin/env python3
"""Convert LICENSE.txt (plain text) into license.rtf for the MSI license page."""
import pathlib

src = pathlib.Path(__file__).with_name("LICENSE.txt").read_text(encoding="utf-8-sig")

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

paras = [esc(line.rstrip()) for line in src.splitlines()]
body = "".join(p + r"\par " for p in paras)
rtf = (
    r"{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fnil\fcharset0 MS Sans Serif;}}"
    r"\viewkind\uc1\f0\fs18 " + body + r"}"
)
out = pathlib.Path(__file__).with_name("license.rtf")
out.write_text(rtf, encoding="cp1252")
print(f"wrote {out} ({len(rtf)} bytes)")
