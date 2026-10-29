"""Page equipped Sage skills in the existing battle action bar."""
from pathlib import Path
import subprocess, tempfile, sys

root=Path(sys.argv[1]).resolve()
original=root/'web/ninja_saga.swf'
jar=root/'tools/ffdec/ffdec.jar'
work=Path(tempfile.mkdtemp(prefix='ninja-sage-battle-'))
cmd=['java','-Xmx2g','-Duser.home='+str(work),'-Djava.awt.headless=true','-jar',str(jar)]
subprocess.run(cmd+['-export','script',str(work/'source'),str(original)],check=True,stdout=subprocess.DEVNULL)
src=work/'source/scripts/ninjasaga/linkage/BattleActionBar.as'
s=src.read_text()

def replace(old,new):
    global s
    if s.count(old)!=1: raise RuntimeError(f'Expected one match, got {s.count(old)}: {old[:80]}')
    s=s.replace(old,new)

replace('''      private var talentPagerText:TextField;''','''      private var talentPagerText:TextField;

      private var sagePage:int = 0;

      private var sagePager:MovieClip;

      private var sagePagerText:TextField;''')
replace('''         senjutsuList = [];
         Out.debug("SENJUTSU_DEBUG","senjutsuFeature enabled: "''','''         senjutsuList = [];
         this.sagePage = 0;
         Out.debug("SENJUTSU_DEBUG","senjutsuFeature enabled: "''')

start=s.index('      private function reverseAniStageOneUpdate(')
end=s.index('      private function reverseAniStageTwoCompleted()',start)
method=s[start:end]
old='Central.main.SENJUTSU_BUTTON_ENABLE_ORDER.indexOf(int(_loc6_[1]) + 1)'
if method.count(old)!=2: raise RuntimeError(f'Sage lookup count: {method.count(old)}')
method=method.replace(old,'this.sagePage * 8 + '+old)
method=method.replace('''               if(!_loc3_.getSenjutsuButtonEnableArr()[int(_loc6_[1])])
               {
                  param1.visible = false;
               }
               return;''','''               param1.visible = false;
               return;''')
method=method.replace('''            param1.fn = Central.battle.onSenjutsu;''','''            param1.fn = this.onPagedSage;''')
if 'param1.fn = this.onPagedSage;' not in method: raise RuntimeError('Sage handler missing')
s=s[:start]+method+s[end:]

replace('''      private function reverseAniStageTwoCompleted() : void
      {
         this["fullMaskMc"].visible = false;
         this["fullMaskMc"].mouseEnabled = false;
      }''','''      private function reverseAniStageTwoCompleted() : void
      {
         this["fullMaskMc"].visible = false;
         this["fullMaskMc"].mouseEnabled = false;
         this.updateSagePager();
      }''')

needle='''               if(_loc3_.getSenjutsuButtonEnableArr()[_loc4_] == true && Boolean(_loc1_[Central.main.SENJUTSU_BUTTON_ENABLE_ORDER.indexOf(_loc4_ + 1)]))'''
replace(needle,'''               if(_loc3_.getSenjutsuButtonEnableArr()[_loc4_] == true && Boolean(_loc1_[this.sagePage * 8 + Central.main.SENJUTSU_BUTTON_ENABLE_ORDER.indexOf(_loc4_ + 1)]))''')

at=s.index('      private function onTurnTimer(')
s=s[:at]+'''      private function updateSagePager() : void
      {
         var pages:int = Math.max(1,Math.ceil(senjutsuList.length / 8));
         if(this.sagePage >= pages)
         {
            this.sagePage = pages - 1;
         }
         if(this.sagePager == null)
         {
            this.sagePager = new MovieClip();
            this.sagePager.graphics.beginFill(3153988,0.94);
            this.sagePager.graphics.lineStyle(2,16761146);
            this.sagePager.graphics.drawRoundRect(0,0,90,26,8);
            this.sagePager.graphics.endFill();
            this.sagePager.buttonMode = true;
            this.sagePager.useHandCursor = true;
            this.sagePager.mouseChildren = false;
            this.sagePagerText = new TextField();
            this.sagePagerText.defaultTextFormat = new TextFormat("_sans",12,16777215,true);
            this.sagePagerText.width = 90;
            this.sagePagerText.height = 24;
            this.sagePagerText.selectable = false;
            this.sagePagerText.mouseEnabled = false;
            this.sagePager.addChild(this.sagePagerText);
            this.sagePager.addEventListener(MouseEvent.CLICK,this.onSageNext);
         }
         if(this.sagePager.parent != this)
         {
            this.addChild(this.sagePager);
         }
         var bounds:Rectangle = this["reverseBtn"].getBounds(this);
         this.sagePager.x = bounds.x - 96;
         this.sagePager.y = bounds.y + (bounds.height - 26) / 2;
         this.sagePagerText.text = "Next " + (this.sagePage + 1) + "/" + pages;
         this.sagePager.visible = pages > 1 && this.skillBarCurrStatus == this.SKILL_BAR_CURRENT_STATUS[1];
      }

      private function onSageNext(event:MouseEvent) : void
      {
         this.sagePage = (this.sagePage + 1) % Math.max(1,Math.ceil(senjutsuList.length / 8));
         this.disableAllReversibleButtons();
         var i:int = 0;
         while(i < 8)
         {
            var slot:MovieClip = this["skill_" + i];
            GF.removeAllChild(slot["holder"]);
            Central.main.hideDynamicTooltip(slot);
            slot.skillData = null;
            this.reverseAniStageOneUpdate(slot);
            i++;
         }
         this.enableAllReversibleButtons();
         this.updateSagePager();
      }

      private function onPagedSage(event:MouseEvent) : void
      {
         var slot:MovieClip = MovieClip(event.currentTarget);
         if(slot.skillData == null)
         {
            return;
         }
         var physical:int = int(slot.name.split("_")[1]);
         var index:int = this.sagePage * 8 + Central.main.SENJUTSU_BUTTON_ENABLE_ORDER.indexOf(physical + 1);
         var proxy:MovieClip = new MovieClip();
         proxy.name = "skill_" + index;
         proxy.skillData = slot.skillData;
         proxy.addEventListener(MouseEvent.CLICK,Central.battle.onSenjutsu);
         proxy.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
      }

'''+s[at:]
patched=work/'BattleActionBar.as'
patched.write_text(s)
out=work/'BattleActionBar.swf'
subprocess.run(cmd+['-replace',str(original),str(out),'ninjasaga.linkage.BattleActionBar',str(patched)],check=True,stdout=subprocess.DEVNULL)
verify=work/'verify'
subprocess.run(cmd+['-export','script',str(verify),str(out)],check=True,stdout=subprocess.DEVNULL)
v=(verify/'scripts/ninjasaga/linkage/BattleActionBar.as').read_text()
for needle in ['onSageNext','onPagedSage','this.sagePage * 8 + Central.main.SENJUTSU_BUTTON_ENABLE_ORDER']:
    assert needle in v,needle
assert 'onPagedTalent' in v
print(out)
print('Input',original.stat().st_size,'output',out.stat().st_size)
