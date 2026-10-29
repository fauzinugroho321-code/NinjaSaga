"""Repair the two Main regressions in the 2026-10-27 local client.

Usage: python3 repair-login-menu.py INPUT.swf OUTPUT.swf
The input checksum is checked because the instruction offsets are version specific.
"""
from pathlib import Path
import hashlib
import sys
import zlib

BEFORE = '60ed1eb502bcd920042e56e61c8a74798956d8dd3ead1563d955573aebe09f8e'
AFTER = '38c3c7680d1990c207d5ddd74857c3e1617deeeaf80f1e8a590dd976758a2987'


def repair(source):
    digest = hashlib.sha256(source).hexdigest()
    if digest == AFTER:
        return source
    if digest != BEFORE:
        raise ValueError('Unexpected SWF version; refusing to change its instructions')
    if source[:3] != b'CWS':
        raise ValueError('Expected a compressed SWF')
    decoded = bytearray(source[:8] + zlib.decompress(source[8:]))
    original = bytes(decoded)
    loop = bytes.fromhex('62 06 d2 66 b5 02 0c 33 00 00')
    popup = bytes.fromhex('10 05 00 00 09 10 11 00 00 24 00 63 07 24 ff 08 07 1b f3 ff ff ff ff ff ff 0f')
    for pattern in (loop, popup):
        if decoded.count(pattern) != 1:
            raise ValueError('Expected one instruction sequence per repair')
    offset = decoded.index(loop)
    # Exit shiftBtnPos when its index reaches the number of menu buttons.
    decoded[offset + 7] = 0xa3
    offset = decoded.index(popup)
    # The empty switch had an invalid case count. Preserve the following callback.
    decoded[offset:offset + len(popup)] = b'\x02' * len(popup)
    assert len(decoded) == len(original)
    assert sum(a != b for a, b in zip(original, decoded)) == 27
    result = b'CWS' + decoded[3:8] + zlib.compress(decoded[8:], 9)
    assert hashlib.sha256(result).hexdigest() == AFTER
    return result


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, target = map(Path, sys.argv[1:])
    if source.resolve() == target.resolve():
        raise SystemExit('Use a separate output path to preserve the input')
    target.write_bytes(repair(source.read_bytes()))
    print('Repaired SWF:', target)
