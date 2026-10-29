"""Rebuild the local Ninja Saga client with paged battle talent slots.

Requires Java and bundled FFDec. The source SWF is the pre-pagination backup;
the patched SWF is emitted to a temporary directory for review.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
SOURCE_SWF = ROOT / 'backups/ninja_saga.before-talent-pages.swf'
FFDEC_JAR = ROOT / 'tools/ffdec/ffdec.jar'
if not FFDEC_JAR.is_file():
    raise SystemExit('FFDec tidak ada di tools/ffdec/ffdec.jar')
work = Path(tempfile.mkdtemp(prefix='ninja-talent-battle-'))
source_dir = work / 'source'
output_swf = work / 'ninja_saga.swf'
cmd = ['java', '-Duser.home=' + str(work), '-Djava.awt.headless=true', '-jar', str(FFDEC_JAR)]
subprocess.run(cmd + ['-export', 'script', str(source_dir), str(SOURCE_SWF)], check=True, stdout=subprocess.DEVNULL)
src = (source_dir / 'scripts/ninjasaga/linkage/BattleActionBar.as').read_text()

def once(old,new):
    global src
    n=src.count(old)
    if n!=1: raise RuntimeError(f'expected 1 occurrence, got {n}: {old[:100]!r}')
    src=src.replace(old,new)

def method(name,next_name):
    a=src.index('      '+name)
    b=src.index('      '+next_name,a)
    return a,b,src[a:b]

def edit_method(name,next_name,fn):
    global src
    a,b,s=method(name,next_name)
    src=src[:a]+fn(s)+src[b:]

once('   import flash.display.MovieClip;','   import flash.display.MovieClip;\n   import flash.geom.Rectangle;\n   import flash.text.TextFormat;')
once('      private var skillBarCurrStatus:String = "";','      private var skillBarCurrStatus:String = "";\n\n      private var talentPage:int = 0;\n\n      private var talentPager:MovieClip;\n\n      private var talentPagerText:TextField;')
once('         this.gotoAndStop(Timeline.IDLE);\n         Central.main.getMainMc()["tutorialHintMc"].visible = false;','         if(this.talentPager != null) this.talentPager.visible = false;\n         this.gotoAndStop(Timeline.IDLE);\n         Central.main.getMainMc()["tutorialHintMc"].visible = false;')

# The original renderer indexed the full talent lists directly into four physical slots.
def init_patch(s):
    a=s.index('         _loc2_ = 0;\n         while(_loc2_ < 4)', s.index('         this.updateSkillCPAndTooltip();'))
    b=s.index('         var _loc34_:Array = _loc22_.getPassiveListArr();',a)
    s=s[:a]+'''         var _loc29_:Array = _loc22_.getBloodlineListArr();
         var _loc32_:Array = _loc22_.getSecretListArr();
         this.renderTalentSlots();
'''+s[b:]
    s=s.replace('while(_loc35_ < _loc34_.length)','while(_loc35_ < _loc34_.length && _loc35_ < this.PASSIVE_BUTTON_NUMBER)')
    s=s.replace('this["bl_" + _loc2_].visible = true;\n               this["se_" + _loc2_].visible = true;',
                'this["bl_" + _loc2_].visible = this["bl_" + _loc2_].skillData != null && this["bl_" + _loc2_]["holder"].numChildren > 0;\n               this["se_" + _loc2_].visible = this["se_" + _loc2_].skillData != null && this["se_" + _loc2_]["holder"].numChildren > 0;')
    s=s.replace('this["pass_" + _loc2_].visible = true;',
                'this["pass_" + _loc2_].visible = _loc2_ < _loc34_.length;')
    return s
edit_method('public function initButtons()','private function initSenjutsuReverseButton()',init_patch)

# Build one page of four Bloodline and four Secret skills. The timeline and the
# action bar both look up these children by their original names, so never
# rename a physical button while rendering a different page.
insert='''      private function renderTalentSlots() : void
      {
         var fighter:* = Central.battle.getAttacker();
         if(this.talentPage >= this.getTalentPageCount()) this.talentPage = 0;
         var blList:Array = fighter.getBloodlineListArr();
         var seList:Array = fighter.getSecretListArr();
         var blSwfs:Array = fighter.getBloodlineSwfArr();
         var seSwfs:Array = fighter.getSecretSwfArr();
         var i:int = 0;
         var index:int = 0;
         var slot:MovieClip = null;
         while(i < this.BLOODLINE_BUTTON_NUMBER)
         {
            slot = this["bl_" + i];
            slot.fn = this.onPagedTalent;
            this.disableButton("bl_" + i);
            GF.removeAllChild(slot["holder"]);
            Central.main.hideDynamicTooltip(slot);
            slot.skillData = null;
            index = this.talentPage * this.BLOODLINE_BUTTON_NUMBER + i;
            slot.talentKind = "bl";
            slot.talentIndex = index;
            if(index < blList.length && blList[index].skill_id != "1022" && blList[index].skill_id != "1046" && blSwfs[index] != null)
            {
               slot["holder"].addChild(blSwfs[index].getAsset("icon"));
            }
            slot.visible = slot["holder"].numChildren > 0;
            i++;
         }
         i = 0;
         while(i < this.SECRET_BUTTON_NUMBER)
         {
            slot = this["se_" + i];
            slot.fn = this.onPagedTalent;
            this.disableButton("se_" + i);
            GF.removeAllChild(slot["holder"]);
            Central.main.hideDynamicTooltip(slot);
            slot.skillData = null;
            index = this.talentPage * this.SECRET_BUTTON_NUMBER + i;
            slot.talentKind = "se";
            slot.talentIndex = index;
            if(index < seList.length && seSwfs[index] != null)
            {
               slot["holder"].addChild(seSwfs[index].getAsset("icon"));
            }
            slot.visible = slot["holder"].numChildren > 0;
            i++;
         }
         this.updateBloodlineCPAndTooltip();
         this.updateSecretCPAndTooltip();
         this.updateTalentPager();
      }

      private function getTalentPageCount() : int
      {
         var fighter:* = Central.battle.getAttacker();
         var blPages:int = Math.ceil(fighter.getBloodlineListArr().length / this.BLOODLINE_BUTTON_NUMBER);
         var sePages:int = Math.ceil(fighter.getSecretListArr().length / this.SECRET_BUTTON_NUMBER);
         return Math.max(1,blPages,sePages);
      }

      private function updateTalentPager() : void
      {
         var pages:int = this.getTalentPageCount();
         if(this.talentPager == null)
         {
            this.talentPager = new MovieClip();
            this.talentPager.graphics.beginFill(0x302044,0.94);
            this.talentPager.graphics.lineStyle(2,0xffc13a);
            this.talentPager.graphics.drawRoundRect(0,0,86,25,10);
            this.talentPager.graphics.endFill();
            this.talentPager.buttonMode = true;
            this.talentPager.useHandCursor = true;
            this.talentPager.mouseChildren = false;
            this.talentPagerText = new TextField();
            this.talentPagerText.defaultTextFormat = new TextFormat("_sans",12,0xffffff,true);
            this.talentPagerText.width = 86;
            this.talentPagerText.height = 22;
            this.talentPagerText.selectable = false;
            this.talentPagerText.mouseEnabled = false;
            this.talentPager.addChild(this.talentPagerText);
            this.talentPager.addEventListener(MouseEvent.CLICK,this.onTalentNext);
         }
         if(this.talentPager.parent != this) this.addChild(this.talentPager);
         var bounds:Rectangle = this["bloodline_Logo"].getBounds(this);
         this.talentPager.x = bounds.x + (bounds.width - 86) / 2;
         this.talentPager.y = bounds.y + bounds.height * 0.67;
         this.talentPagerText.text = "Next  " + (this.talentPage + 1) + "/" + pages;
         this.talentPager.visible = pages > 1;
      }

      private function onTalentNext(event:MouseEvent) : void
      {
         this.talentPage = (this.talentPage + 1) % this.getTalentPageCount();
         this.renderTalentSlots();
         this.enableAllButtons();
      }

      private function onPagedTalent(event:MouseEvent) : void
      {
         var slot:MovieClip = MovieClip(event.currentTarget);
         if(slot.skillData == null) return;
         var proxy:MovieClip = new MovieClip();
         proxy.name = slot.talentKind + "_" + slot.talentIndex;
         proxy.skillData = slot.skillData;
         proxy.addEventListener(MouseEvent.CLICK,Central.battle.onBloodline);
         proxy.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
      }

'''
once('      private function initSenjutsuReverseButton() : void',insert+'      private function initSenjutsuReverseButton() : void')

# Reuse the game's original CP, cooldown and tooltip calculations, but map each
# physical slot to its absolute talent index on the selected page.
def cp_patch(s,kind):
    listname='_loc10_'
    if kind=='bloodline':
        a=s.index('         _loc1_ = 0;\n         while(_loc1_ < _loc10_.length)')
        b=s.index('         _loc1_ = 0;\n         while(_loc1_ < _loc10_.length)',a+1)
        s=s[:a]+s[b:]
        s=s.replace('while(_loc1_ < _loc10_.length)','while(_loc1_ < this.BLOODLINE_BUTTON_NUMBER && this.talentPage * this.BLOODLINE_BUTTON_NUMBER + _loc1_ < _loc10_.length)')
        s=s.replace('_loc10_[_loc1_]','_loc10_[this.talentPage * this.BLOODLINE_BUTTON_NUMBER + _loc1_]')
    else:
        s=s.replace('while(_loc1_ < _loc10_.length)','while(_loc1_ < this.SECRET_BUTTON_NUMBER && this.talentPage * this.SECRET_BUTTON_NUMBER + _loc1_ < _loc10_.length)')
        s=s.replace('_loc10_[_loc1_]','_loc10_[this.talentPage * this.SECRET_BUTTON_NUMBER + _loc1_]')
    return s
edit_method('private function updateSecretCPAndTooltip()','private function updateBloodlineCPAndTooltip()',lambda s:cp_patch(s,'secret'))
edit_method('private function updateBloodlineCPAndTooltip()','private function updateSkillCPAndTooltip()',lambda s:cp_patch(s,'bloodline'))

def enable_patch(s):
    a=s.index('         var _loc9_:Array = _loc4_.getBloodlineListArr();')
    b=s.index('         var _loc11_:Array = _loc4_.getPassiveListArr();',a)
    middle=s[a:b]
    middle=middle.replace('while(_loc8_ < _loc9_.length)','while(_loc8_ < this.BLOODLINE_BUTTON_NUMBER && this.talentPage * this.BLOODLINE_BUTTON_NUMBER + _loc8_ < _loc9_.length)')
    middle=middle.replace('_loc9_[_loc8_]','_loc9_[this.talentPage * this.BLOODLINE_BUTTON_NUMBER + _loc8_]')
    middle=middle.replace('if(_loc4_.getBloodlineButtonEnableArr()[_loc8_])','if(this["bl_" + _loc8_].skillData != null && _loc4_.getBloodlineButtonEnableArr()[_loc8_])')
    middle=middle.replace('while(_loc8_ < _loc10_.length)','while(_loc8_ < this.SECRET_BUTTON_NUMBER && this.talentPage * this.SECRET_BUTTON_NUMBER + _loc8_ < _loc10_.length)')
    middle=middle.replace('if(_loc4_.getSecretButtonEnableArr()[_loc8_])','if(this["se_" + _loc8_].skillData != null && _loc4_.getSecretButtonEnableArr()[_loc8_])')
    return s[:a]+middle+s[b:].replace('while(_loc12_ < _loc11_.length)','while(_loc12_ < _loc11_.length && _loc12_ < this.PASSIVE_BUTTON_NUMBER)')
edit_method('public function enableAllButtons()','public function disableAllButtons()',enable_patch)

out = work / 'BattleActionBar.as'
out.write_text(src)
subprocess.run(cmd + ['-replace', str(SOURCE_SWF), str(output_swf),
                      'ninjasaga.linkage.BattleActionBar', str(out)], check=True)
verify_dir = work / 'verify'
subprocess.run(cmd + ['-export', 'script', str(verify_dir), str(output_swf)],
               check=True, stdout=subprocess.DEVNULL)
verify = (verify_dir / 'scripts/ninjasaga/linkage/BattleActionBar.as').read_text()
for marker in ('renderTalentSlots', 'onTalentNext', 'onPagedTalent',
               'this.talentPagerText.text = "Next  "'):
    if marker not in verify: raise RuntimeError('Verifikasi SWF gagal: ' + marker)
if 'slot.name = "bl_" + index' in verify or 'slot.name = "se_" + index' in verify:
    raise RuntimeError('Nama tombol fisik berubah saat pagination')
print('SWF valid:', output_swf, 'ukuran', output_swf.stat().st_size)
print('Sumber patch: backups/ninja_saga.before-talent-pages.swf')
