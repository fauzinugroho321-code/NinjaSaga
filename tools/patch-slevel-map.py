"""Allow the local level-80 character to play all five S-Level stages."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(sys.argv[1]).resolve()
original = root / 'web/cdn/swf/latest/swf/panels/Panel_80level_mission_map.swf'
jar = root / 'tools/ffdec/ffdec.jar'
work = Path(tempfile.mkdtemp(prefix='ninja-slevel-map-'))
cmd = ['java', '-Xmx2g', '-Duser.home=' + str(work), '-Djava.awt.headless=true',
       '-jar', str(jar)]
subprocess.run(cmd + ['-export', 'script', str(work / 'source'), str(original)],
               check=True, stdout=subprocess.DEVNULL)
source = work / 'source/scripts/ninjasaga/linkage/EightyLevelMissionMap1.as'
text = source.read_text()
for level in range(81, 85):
    old = '"level":' + str(level)
    if text.count(old) != 1:
        raise RuntimeError('Expected one stage requirement: ' + old)
    text = text.replace(old, '"level":80')
patched = work / 'EightyLevelMissionMap1.as'
patched.write_text(text)
output = work / 'Panel_80level_mission_map.swf'
subprocess.run(cmd + ['-replace', str(original), str(output),
                      'ninjasaga.linkage.EightyLevelMissionMap1', str(patched)],
               check=True, stdout=subprocess.DEVNULL)
subprocess.run(cmd + ['-export', 'script', str(work / 'verify'), str(output)],
               check=True, stdout=subprocess.DEVNULL)
verified = (work / 'verify/scripts/ninjasaga/linkage/EightyLevelMissionMap1.as').read_text()
if verified.count('"level":80') != 5 or any('"level":' + str(level) in verified for level in range(81, 85)):
    raise RuntimeError('Panel misi S-Level tidak terverifikasi.')
print(output)
