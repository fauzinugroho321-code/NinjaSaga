"""Add Talent-panel pages to the existing local Ninja Saga SWF.

Usage: python3 tools/patch_ninja_talent_menu.py ROOT [SOURCE_SWF]
Build from the given SWF, preserving all earlier changes. Requires bundled FFDec.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(sys.argv[1]).resolve()
SOURCE = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / 'web/cdn/swf/latest/swf/panels/bloodline_profile.swf'
JAR = ROOT / 'tools/ffdec/ffdec.jar'
work = Path(tempfile.mkdtemp(prefix='ninja-talent-menu-'))
cmd = ['java', '-Duser.home=' + str(work), '-Djava.awt.headless=true', '-jar', str(JAR)]
source_dir = work / 'source'
subprocess.run(cmd + ['-export', 'script', str(source_dir), str(SOURCE)], check=True, stdout=subprocess.DEVNULL)
source_path = source_dir / 'scripts/ninjasaga/linkage/BloodlineProfile.as'
src = source_path.read_text()
if 'btnUpgradeMax' not in src:
    raise RuntimeError('Expected current profile with MAX button; refusing to patch old SWF')
if 'onTalentNext' in src:
    raise RuntimeError('Talent menu already has paging; refusing to patch twice')

def once(old, new):
    global src
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f'Expected one match, got {count}: {old[:80]!r}')
    src = src.replace(old, new)

once('      internal var char_Arr:Array = [];', '''      internal var char_Arr:Array = [];

      private var talentPage:int = 0;

      private var talentBloodlineIds:Array = [];

      private var talentSecretIds:Array = [];

      private var talentNextButton:MovieClip;

      private var talentNextLabel:TextField;''')

# Never filter the character's actual talent data; the existing upgrade handler
# needs the full array. Only the renderer's breakArr() sees this page's groups.
a = src.index('      private function breakArr() : void')
b = src.index('      private function matchSkillID(', a)
method = src[a:b]
method = method.replace('         this.swap_BL_Arr = [];', '''         var visibleTalentEntries:Array = this.getVisibleTalentEntries();
         this.BLID = 0;
         this.SE1ID = 0;
         this.SE2ID = 0;
         this.swap_BL_Arr = [];''', 1)
method = method.replace('this.char_Arr', 'visibleTalentEntries')
src = src[:a] + method + src[b:]

methods = '''      private function refreshTalentGroups() : void
      {
         var entry:Object = null;
         var group:Object = null;
         var id:int = 0;
         this.talentBloodlineIds = [];
         this.talentSecretIds = [];
         for each(entry in this.char_Arr)
         {
            id = int(entry.bloodline_id);
            if(id <= 0) continue;
            group = Central.main.BLOODLINE_DATA["bloodline" + id];
            if(group == null) continue;
            if(group.type == BloodlineData.SKILL_TYPE_BLOODLINE)
            {
               if(this.talentBloodlineIds.indexOf(id) < 0) this.talentBloodlineIds.push(id);
            }
            else if(group.type == BloodlineData.SKILL_TYPE_SECRET)
            {
               if(this.talentSecretIds.indexOf(id) < 0) this.talentSecretIds.push(id);
            }
         }
         if(this.talentPage >= this.getTalentPageCount()) this.talentPage = 0;
      }

      private function getTalentPageCount() : int
      {
         return Math.max(1,this.talentBloodlineIds.length,Math.ceil(this.talentSecretIds.length / 2));
      }

      private function getVisibleTalentEntries() : Array
      {
         var result:Array = [];
         var entry:Object = null;
         var bloodlineId:int = this.talentPage < this.talentBloodlineIds.length ? int(this.talentBloodlineIds[this.talentPage]) : 0;
         var firstSecret:int = this.talentPage * 2 < this.talentSecretIds.length ? int(this.talentSecretIds[this.talentPage * 2]) : 0;
         var secondSecret:int = this.talentPage * 2 + 1 < this.talentSecretIds.length ? int(this.talentSecretIds[this.talentPage * 2 + 1]) : 0;
         for each(entry in this.char_Arr)
         {
            if(int(entry.bloodline_id) == bloodlineId) result.push(entry);
         }
         for each(entry in this.char_Arr)
         {
            if(int(entry.bloodline_id) == firstSecret) result.push(entry);
         }
         for each(entry in this.char_Arr)
         {
            if(int(entry.bloodline_id) == secondSecret) result.push(entry);
         }
         return result;
      }

      private function updateTalentNextButton() : void
      {
         var count:int = this.getTalentPageCount();
         if(this.talentNextButton == null)
         {
            this.talentNextButton = new MovieClip();
            this.talentNextButton.name = "talentNextButton";
            this.talentNextButton.graphics.lineStyle(2,0x471e10);
            this.talentNextButton.graphics.beginFill(0xa90000);
            this.talentNextButton.graphics.drawRoundRect(0,0,116,36,12);
            this.talentNextButton.graphics.endFill();
            this.talentNextButton.buttonMode = true;
            this.talentNextButton.useHandCursor = true;
            this.talentNextButton.mouseChildren = false;
            this.talentNextLabel = new TextField();
            this.talentNextLabel.width = 116;
            this.talentNextLabel.height = 30;
            this.talentNextLabel.y = 5;
            this.talentNextLabel.selectable = false;
            this.talentNextLabel.mouseEnabled = false;
            this.talentNextButton.addChild(this.talentNextLabel);
            this.talentNextButton.addEventListener(MouseEvent.CLICK,this.onTalentNext);
         }
         if(this.talentNextButton.parent != this) this.addChild(this.talentNextButton);
         this.talentNextButton.x = 444;
         this.talentNextButton.y = 30;
         this.talentNextLabel.htmlText = "<p align='center'><font face='_sans' size='15' color='#ffffff'><b>Next  " + (this.talentPage + 1) + "/" + count + "</b></font></p>";
         this.talentNextButton.visible = count > 1;
      }

      private function onTalentNext(event:MouseEvent) : void
      {
         this.talentPage = (this.talentPage + 1) % this.getTalentPageCount();
         this.checkUserSkill();
      }

      private function hideTalentNextButton() : void
      {
         if(this.talentNextButton != null) this.talentNextButton.visible = false;
      }

'''
once('      private function breakArr() : void', methods + '      private function breakArr() : void')
once('         this.clearSkillTree();\n         var _loc4_:uint = 0;', '''         this.refreshTalentGroups();
         this.updateTalentNextButton();
         this.clearSkillTree();
         var _loc4_:uint = 0;''')
# Root children survive timeline changes. Keep the button on the main Talent view.
once('      private function onTrain() : void\n      {', '      private function onTrain() : void\n      {\n         this.hideTalentNextButton();')
once('      private function onMax() : void\n      {', '      private function onMax() : void\n      {\n         this.hideTalentNextButton();')
once('      private function onGetBP() : void\n      {', '      private function onGetBP() : void\n      {\n         this.hideTalentNextButton();')

patched_as = work / 'BloodlineProfile.as'
patched_as.write_text(src)
output = work / 'bloodline_profile.swf'
subprocess.run(cmd + ['-replace', str(SOURCE), str(output),
                      'ninjasaga.linkage.BloodlineProfile', str(patched_as)], check=True)
verify_dir = work / 'verify'
subprocess.run(cmd + ['-export', 'script', str(verify_dir), str(output)], check=True, stdout=subprocess.DEVNULL)
verify = (verify_dir / 'scripts/ninjasaga/linkage/BloodlineProfile.as').read_text()
for marker in ('onTalentNext', 'getVisibleTalentEntries', 'Next  ', 'btnUpgradeMax'):
    if marker not in verify:
        raise RuntimeError('Re-export verification failed: ' + marker)
print(output)
print(f'Input {SOURCE.stat().st_size} bytes; output {output.stat().st_size} bytes')
