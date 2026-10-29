"""Give Mission Room team cards five element slots without recompiling AS3.

Usage: python3 tools/repair-recruit-elements.py INPUT.swf OUTPUT.swf
Only the supported original panel is accepted. The output must be a new file.
"""
from copy import deepcopy
from pathlib import Path
import hashlib
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ORIGINAL_SHA256 = '20aff964d5eafff3e4fac2ca827753b4b7dae66b784b80b220342290350da2b6'
# AVM2 loop tails: getlocal counter; pushbyte 4; iflt (back to idle cleanup).
# Same-length edits keep every branch and exception offset intact.
CLEANUP_LOOPS = (
    ('62 06 24 04 15 dd ff ff', 1),
    ('d3 24 04 15 dd ff ff', 3),
    ('62 06 24 04 15 db ff ff', 1),
)
CARD_SPRITES = ('130', '132')


def recruit_body(root):
    for abc in root.findall('.//abc'):
        constants = abc.find('constants')
        strings = [x.text or '' for x in constants.find('constant_string')]
        multinames = constants.find('constant_multiname')

        def name(index):
            return strings[int(multinames[int(index)].get('name_index', '0'))]

        for instance in abc.find('instance_info'):
            if name(instance.get('name_index')) != 'MissionPanel_2':
                continue
            trait = next(x for x in instance.iter()
                         if x.get('method_info') and x.get('name_index')
                         and name(x.get('name_index')) == 'onRecruitFriend')
            return next(x for x in abc.find('bodies')
                        if x.get('method_info') == trait.get('method_info'))
    raise ValueError('MissionPanel_2.onRecruitFriend was not found')


def patch_xml(root):
    body = recruit_body(root)
    original = bytes.fromhex(body.get('codeBytes'))
    patched = original
    for pattern, expected in CLEANUP_LOOPS:
        old = bytes.fromhex(pattern)
        assert patched.count(old) == expected, 'Unexpected element cleanup code'
        new = old.replace(b'\x24\x04', b'\x24\x06')
        patched = patched.replace(old, new)
    assert len(original) == len(patched)
    assert sum(a != b for a, b in zip(original, patched)) == 5
    body.set('codeBytes', patched.hex())

    for sprite_id in CARD_SPRITES:
        card = root.find(f'.//item[@type="DefineSpriteTag"][@spriteId="{sprite_id}"]')
        assert card is not None and card.get('frameCount') == '1'
        tags = card.find('subTags')
        slots = {x.get('name'): x for x in tags if (x.get('name') or '').startswith('skillBtn')}
        assert set(slots) == {'skillBtn1', 'skillBtn2', 'skillBtn3'}
        assert {x.get('characterId') for x in slots.values()} == {'92'}
        template = slots['skillBtn1']
        base_x = int(template.find('matrix').get('translateX'))
        # Keep the same row center; five 23.25 px icons fit the original 125 px area.
        row_y = int(template.find('matrix').get('translateY')) + 106
        next_depth = max(int(x.get('depth', '0')) for x in tags) + 1
        for number in (4, 5):
            slot = deepcopy(template)
            slot.set('name', f'skillBtn{number}')
            slot.set('depth', str(next_depth))
            next_depth += 1
            tags.insert(list(tags).index(next(x for x in tags if x.get('type') == 'ShowFrameTag')), slot)
            slots[slot.get('name')] = slot
        for number in range(1, 6):
            matrix = slots[f'skillBtn{number}'].find('matrix')
            matrix.set('scaleX', '0.5')
            matrix.set('scaleY', '0.5')
            matrix.set('translateX', str(base_x + (number - 1) * 510))
            matrix.set('translateY', str(row_y))
            matrix.set('nTranslateBits', '14')


def check_contract(root):
    code = bytes.fromhex(recruit_body(root).get('codeBytes'))
    for pattern, count in CLEANUP_LOOPS:
        old = bytes.fromhex(pattern)
        assert old not in code
        assert code.count(old.replace(b'\x24\x04', b'\x24\x06')) == count
    for sprite_id in CARD_SPRITES:
        card = root.find(f'.//item[@type="DefineSpriteTag"][@spriteId="{sprite_id}"]')
        tags = card.find('subTags')
        assert list(tags)[-1].get('type') == 'ShowFrameTag'
        depths = [x.get('depth') for x in tags if x.get('depth')]
        assert len(depths) == len(set(depths)), 'Display objects must not replace each other'
        slots = {x.get('name'): x for x in tags if (x.get('name') or '').startswith('skillBtn')}
        assert set(slots) == {f'skillBtn{i}' for i in range(1, 6)}
        matrices = [slots[f'skillBtn{i}'].find('matrix') for i in range(1, 6)]
        lefts = [int(x.get('translateX')) for x in matrices]
        widths = [930 * float(x.get('scaleX')) for x in matrices]
        assert all(lefts[i] + widths[i] < lefts[i + 1] for i in range(4))
        assert lefts[-1] + widths[-1] - lefts[0] <= 2510, 'Icons must fit the team card'
        assert all(x.get('characterId') == '92' for x in slots.values())


def repair(source, target, ffdec):
    assert source.resolve() != target.resolve(), 'Use a separate output file'
    assert not target.exists(), 'Output already exists'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == ORIGINAL_SHA256, 'Unexpected panel version'
    with tempfile.TemporaryDirectory(prefix='ninja-recruit-') as temp:
        temp = Path(temp)
        command = ['java', '-Duser.home=/private/tmp', '-Xmx1g', '-jar', str(ffdec)]
        subprocess.run(command + ['-swf2xml', str(source), str(temp / 'original.xml')], check=True)
        tree = ET.parse(temp / 'original.xml')
        # Capture every original ABC including constants, traits, instructions and exceptions.
        original_abcs = [deepcopy(x) for x in tree.getroot().findall('.//abc')]
        patch_xml(tree.getroot())
        check_contract(tree.getroot())
        tree.write(temp / 'patched.xml', encoding='utf-8', xml_declaration=True)
        subprocess.run(command + ['-xml2swf', str(temp / 'patched.xml'), str(target)], check=True)
        subprocess.run(command + ['-swf2xml', str(target), str(temp / 'verified.xml')], check=True)
        verified = ET.parse(temp / 'verified.xml').getroot()
        check_contract(verified)
        # Only five one-byte loop bounds may differ across ALL script bytecode.
        actual_abcs = verified.findall('.//abc')
        assert len(original_abcs) == len(actual_abcs)
        changed = 0
        for before, after in zip(original_abcs, actual_abcs):
            for old, new in zip(before.find('bodies'), after.find('bodies')):
                old_code, new_code = bytes.fromhex(old.get('codeBytes')), bytes.fromhex(new.get('codeBytes'))
                if old_code != new_code:
                    assert old.get('method_info') == recruit_body(verified).get('method_info')
                    assert len(old_code) == len(new_code)
                    differences = [(a, b) for a, b in zip(old_code, new_code) if a != b]
                    assert differences == [(4, 6)] * 5
                    changed += 1
                    old.set('codeBytes', new.get('codeBytes'))
            # File offsets change on serialization; all other ABC data must be identical.
            for abc in (before, after):
                for element in abc.iter():
                    element.attrib.pop('fileOffset', None)
            assert ET.tostring(before) == ET.tostring(after), 'Unrelated ABC data changed'
        assert changed == 1
    print('Verified: both team cards support five elements; only five AS3 loop bounds changed.')
    print('SHA256:', hashlib.sha256(target.read_bytes()).hexdigest())


if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:3])
    # An optional third argument is useful when running this script from a staging folder.
    ffdec = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).resolve().parent / 'ffdec' / 'ffdec.jar'
    repair(source, target, ffdec)
