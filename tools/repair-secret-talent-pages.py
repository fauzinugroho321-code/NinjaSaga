"""Repair Secret Talent page rendering in the current local Ninja Saga client.

Usage: python3 repair-secret-talent-pages.py INPUT.swf OUTPUT.swf
"""
from pathlib import Path
import hashlib
import sys
import zlib

BEFORE = 'b91b7eab8b08998ac162a899ef2a384031b8f9c383f3f9b97f99579df6dfdc59'


def repair(raw):
    if hashlib.sha256(raw).hexdigest() != BEFORE or raw[:3] != b'CWS':
        raise ValueError('Unexpected SWF version; refusing to patch its instructions')
    decoded = bytearray(raw[:8] + zlib.decompress(raw[8:]))
    original = bytes(decoded)
    old = bytes.fromhex('d0 66 ec 35 62 08 66 b1 04 ad 2a 12 0e 00 00 29 62 08 d0 66 ec 35 66 94 36 73 24 0c ad 12 19 00 00 d0 2c 84 0d 66 94 36 2c 87 3c 62 08 d0 66 ec 35 66 94 36 73 a0 4f d2 36 01')
    assert decoded.count(old) == 1, 'Expected exactly one Talent logo renderer'
    logo = bytes.fromhex('d0 2c 84 0d 66 94 36')
    has_bloodline = bytes.fromhex('62 06 66 b1 04 24 00 af')
    set_visible = logo + has_bloodline + bytes.fromhex('61 b8 06')
    render_logo = old[33:]
    assert render_logo == bytes.fromhex('d0 2c 84 0d 66 94 36 2c 87 3c 62 08 d0 66 ec 35 66 94 36 73 a0 4f d2 36 01')
    new = set_visible + has_bloodline + b'\x12\x00\x00\x00' + render_logo
    assert len(new) <= len(old)
    # Secret Talent has no bloodline logo frames. Skip the logo without skipping skill setup.
    branch = len(set_visible) + len(has_bloodline)
    skip = len(old) - branch - 4
    new = new[:branch + 1] + skip.to_bytes(3, 'little', signed=True) + new[branch + 4:]
    new += b'\x02' * (len(old) - len(new))
    offset = decoded.index(old)
    decoded[offset:offset + len(old)] = new
    assert len(decoded) == len(original)
    assert decoded[:offset] == original[:offset]
    assert decoded[offset + len(old):] == original[offset + len(old):]
    result = b'CWS' + decoded[3:8] + zlib.compress(decoded[8:], 9)
    print('Changed renderer bytes:', sum(a != b for a, b in zip(original, decoded)))
    print('SHA256:', hashlib.sha256(result).hexdigest())
    return result


if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:3])
    if source.resolve() == target.resolve():
        raise SystemExit('Use a separate output path to preserve the input')
    target.write_bytes(repair(source.read_bytes()))
