"""Add the missing ActionBase victory alias, preserving all existing bytecode.

Usage: python3 repair-attack10-win.py INPUT.swf OUTPUT.swf FFDEC.jar
The new public method points at gotoWin's existing method body. No game class is
recompiled; every existing method, timeline and shape is checked unchanged.
"""
import copy
import hashlib
import struct
import subprocess
import sys
import tempfile
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path

ORIGINAL_SHA256 = 'a55b5da07753943a6306a306044b8d102d26cbb299fae1bd9f9170f46e062a6b'
ALIAS = 'gotoWin_TypeAttack10'

def action(root):
    for abc in root.findall('.//abc'):
        c = abc.find('constants')
        strings = [x.text or '' for x in c.find('constant_string')]
        names = c.find('constant_multiname')
        def name(index):
            return strings[int(names[int(index)].get('name_index', '0'))]
        for inst in abc.find('instance_info'):
            if name(inst.get('name_index')) == 'ActionBase':
                traits = inst.find('instance_traits/traits')
                if traits is None:
                    raise ValueError('Unexpected ActionBase trait structure')
                original = next(t for t in traits if name(t.get('name_index')) == 'gotoWin')
                return abc, traits, original, name
    raise ValueError('ActionBase was not found')

def normalize(node):
    node = copy.deepcopy(node)
    for el in node.iter():
        el.attrib.pop('fileOffset', None)
        el.tail = None
        if el.text is not None and not el.text.strip(): el.text = None
    return ET.tostring(node)

def tags(path):
    raw = path.read_bytes()
    data = zlib.decompress(raw[8:]) if raw[:3] == b'CWS' else raw[8:]
    p = (5 + 4 * (data[0] >> 3) + 7) // 8 + 4
    header = data[:p]; result = []
    while p < len(data):
        h = struct.unpack_from('<H', data, p)[0]; p += 2; size = h & 63
        if size == 63: size = struct.unpack_from('<I', data, p)[0]; p += 4
        result.append((h >> 6, data[p:p+size])); p += size
        if h >> 6 == 0: break
    return header, result

def repair(source, target, ffdec):
    assert source.resolve() != target.resolve() and not target.exists()
    assert hashlib.sha256(source.read_bytes()).hexdigest() == ORIGINAL_SHA256
    command = ['java', '-Djava.awt.headless=true', '-Duser.home=/private/tmp', '-Xmx1g', '-jar', str(ffdec)]
    with tempfile.TemporaryDirectory(prefix='ninja-win-') as directory:
        directory = Path(directory)
        subprocess.run(command + ['-swf2xml', str(source), str(directory/'before.xml')], check=True)
        tree = ET.parse(directory/'before.xml'); before = copy.deepcopy(tree.getroot())
        abc, traits, original, name = action(tree.getroot())
        assert not any(name(t.get('name_index')) == ALIAS for t in traits)
        c = abc.find('constants'); strings = c.find('constant_string'); names = c.find('constant_multiname')
        string_id = len(strings); ET.SubElement(strings, 'item').text = ALIAS
        qname = copy.deepcopy(names[int(original.get('name_index'))])
        qname.set('name_index', str(string_id)); name_id = len(names); names.append(qname)
        alias = copy.deepcopy(original)
        alias.set('name_index', str(name_id)); alias.attrib.pop('bytes', None); alias.attrib.pop('fileOffset', None)
        assert alias.get('disp_id') == '0' and alias.get('kindType') == '1'
        traits.append(alias)
        tree.write(directory/'patched.xml', encoding='utf-8', xml_declaration=True)
        subprocess.run(command + ['-xml2swf', str(directory/'patched.xml'), str(target)], check=True)
        subprocess.run(command + ['-swf2xml', str(target), str(directory/'verified.xml')], check=True)
        after = ET.parse(directory/'verified.xml').getroot()
        actual_abc, actual_traits, actual_win, resolve = action(after)
        actual_alias = next(t for t in actual_traits if resolve(t.get('name_index')) == ALIAS)
        assert actual_alias.get('method_info') == actual_win.get('method_info')
        actual_traits.remove(actual_alias)
        actual_c = actual_abc.find('constants')
        for key in ('constant_string', 'constant_multiname'):
            array = actual_c.find(key); array.remove(list(array)[-1])
        old_abcs, new_abcs = before.findall('.//abc'), after.findall('.//abc')
        assert len(old_abcs) == len(new_abcs)
        assert all(normalize(a) == normalize(b) for a, b in zip(old_abcs, new_abcs)), 'Existing ABC changed'
        old_header, old_tags = tags(source); new_header, new_tags = tags(target)
        assert old_header == new_header
        assert [c for c, _ in old_tags] == [c for c, _ in new_tags]
        # FFDec XML may re-encode shape bit widths. Transplant only the verified
        # ABC payloads into the original tags so every visual payload stays exact.
        body = bytearray(old_header)
        for (code, original_payload), (_, new_payload) in zip(old_tags, new_tags):
            payload = new_payload if code in (72, 82) else original_payload
            size = len(payload)
            body += struct.pack('<H', (code << 6) | min(size, 63))
            if size >= 63: body += struct.pack('<I', size)
            body += payload
        target.write_bytes(b'CWS' + source.read_bytes()[3:4] + struct.pack('<I', len(body)+8) + zlib.compress(body,9))
        final_header, final_tags = tags(target)
        assert old_header == final_header
        assert all(a == b for (c,a),(_,b) in zip(old_tags,final_tags) if c not in (72,82)), 'Existing visuals/timelines changed'
    print('Verified: one victory alias added; all existing bytecode and visual tags unchanged.')
    print('SHA256:', hashlib.sha256(target.read_bytes()).hexdigest())

if __name__ == '__main__': repair(*map(Path, sys.argv[1:4]))
