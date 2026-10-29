"""Let the Sage upgrade panel switch between Toad and Snake trees."""
from pathlib import Path
import subprocess, tempfile, sys

root=Path(sys.argv[1]).resolve()
original=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else root/'web/cdn/swf/latest/swf/panels/Panel_2015_Sage_Profile.swf'
jar=root/'tools/ffdec/ffdec.jar'
work=Path(tempfile.mkdtemp(prefix='ninja-sage-tree-'))
cmd=['java','-Xmx2g','-Duser.home='+str(work),'-Djava.awt.headless=true','-jar',str(jar)]
subprocess.run(cmd+['-export','script',str(work/'source'),str(original)],check=True,stdout=subprocess.DEVNULL)
src=work/'source/scripts/ninjasaga/linkage/SagaProfile2015.as'
s=src.read_text()

def replace(old,new):
    global s
    if s.count(old)!=1: raise RuntimeError(f'Expected one match, got {s.count(old)}: {old[:80]}')
    s=s.replace(old,new)

replace('   import flash.text.TextField;','   import flash.text.TextField;\n   import flash.text.TextFormat;')
replace('''      private var upgradeMaxPending:Boolean = false;''','''      private var upgradeMaxPending:Boolean = false;

      private var modeSwitchButton:MovieClip;

      private var modeSwitchText:TextField;''')
replace('''         this.getSenjutsuStatus();
         this.loadPanelContent();
      }
      
      public function initEquippedSenjutsu''','''         this.getSenjutsuStatus();
         this.loadPanelContent();
         this.updateModeSwitch();
      }
      
      public function initEquippedSenjutsu''')
replace('''      public function initUpgradePopup(param1:MovieClip) : void
      {
         param1 = param1["panelMC"];''','''      public function initUpgradePopup(param1:MovieClip) : void
      {
         if(this.modeSwitchButton != null)
         {
            this.modeSwitchButton.visible = false;
         }
         param1 = param1["panelMC"];''')
replace('''      public function initViewPopup(param1:MovieClip) : void
      {
         param1 = param1["panelMC"];''','''      public function initViewPopup(param1:MovieClip) : void
      {
         if(this.modeSwitchButton != null)
         {
            this.modeSwitchButton.visible = false;
         }
         param1 = param1["panelMC"];''')
at=s.index('      public function initEquippedSenjutsu(')
s=s[:at]+'''      private function updateModeSwitch() : void
      {
         var hasToad:Boolean = false;
         var hasSnake:Boolean = false;
         for each(var entry:Object in Central.main.getMainChar().senjutsu)
         {
            if(int(entry.skill_id) >= 3001 && int(entry.skill_id) <= 3010)
            {
               hasToad = true;
            }
            if(int(entry.skill_id) >= 3101 && int(entry.skill_id) <= 3110)
            {
               hasSnake = true;
            }
         }
         if(this.modeSwitchButton == null)
         {
            this.modeSwitchButton = new MovieClip();
            this.modeSwitchButton.graphics.beginFill(1049822,0.96);
            this.modeSwitchButton.graphics.lineStyle(2,16761146);
            this.modeSwitchButton.graphics.drawRoundRect(0,0,105,28,8);
            this.modeSwitchButton.graphics.endFill();
            this.modeSwitchButton.buttonMode = true;
            this.modeSwitchButton.useHandCursor = true;
            this.modeSwitchButton.mouseChildren = false;
            this.modeSwitchText = new TextField();
            this.modeSwitchText.defaultTextFormat = new TextFormat("_sans",12,16777215,true);
            this.modeSwitchText.width = 105;
            this.modeSwitchText.height = 26;
            this.modeSwitchText.selectable = false;
            this.modeSwitchText.mouseEnabled = false;
            this.modeSwitchButton.addChild(this.modeSwitchText);
            this.modeSwitchButton.addEventListener(MouseEvent.CLICK,this.onSwitchSageMode);
         }
         if(this.modeSwitchButton.parent != this)
         {
            this.addChild(this.modeSwitchButton);
         }
         this.modeSwitchButton.x = 788;
         this.modeSwitchButton.y = 74;
         this.modeSwitchText.text = this.sagaId == "senjutsu2" ? "Snake Mode >" : "< Toad Mode";
         this.modeSwitchButton.visible = hasToad && hasSnake;
      }

      private function onSwitchSageMode(event:MouseEvent) : void
      {
         this.currSkill = "";
         this.currSenjutsuData = null;
         if(this.sagaId == "senjutsu2")
         {
            this.sagaId = "senjutsu3";
            this.currSkillTree = this.skillTreeSnake;
            this.gotoAndPlay("show_snake");
         }
         else
         {
            this.sagaId = "senjutsu2";
            this.currSkillTree = this.skillTreeToad;
            this.gotoAndPlay("show_toad");
         }
      }

'''+s[at:]
patched=work/'SagaProfile2015.as'
patched.write_text(s)
out=work/'SagaProfile2015.swf'
subprocess.run(cmd+['-replace',str(original),str(out),'ninjasaga.linkage.SagaProfile2015',str(patched)],check=True,stdout=subprocess.DEVNULL)
verify=work/'verify'
subprocess.run(cmd+['-export','script',str(verify),str(out)],check=True,stdout=subprocess.DEVNULL)
v=(verify/'scripts/ninjasaga/linkage/SagaProfile2015.as').read_text()
for needle in ['onSwitchSageMode','updateModeSwitch','upgradeMaxButton']:
    assert needle in v,needle
print(out)
print('Input',original.stat().st_size,'output',out.stat().st_size)
