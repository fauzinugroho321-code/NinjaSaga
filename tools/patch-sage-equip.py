"""Add pages of equipped Sage skills to the existing profile panel."""
from pathlib import Path
import subprocess, tempfile, sys

root=Path(sys.argv[1]).resolve()
original=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else root/'web/cdn/swf/latest/swf/panels/Panel_2014_Sage_Profile.swf'
jar=root/'tools/ffdec/ffdec.jar'
work=Path(tempfile.mkdtemp(prefix='ninja-sage-equip-'))
cmd=['java','-Xmx2g','-Duser.home='+str(work),'-Djava.awt.headless=true','-jar',str(jar)]
subprocess.run(cmd+['-export','script',str(work/'source'),str(original)],check=True,stdout=subprocess.DEVNULL)
src=work/'source/scripts/ninjasaga/linkage/SenjutsuProfile.as'
s=src.read_text()

def replace(old,new):
    global s
    if s.count(old)!=1: raise RuntimeError(f'Expected one match, got {s.count(old)}: {old[:80]}')
    s=s.replace(old,new)

replace('   import flash.text.TextField;','   import flash.text.TextField;\n   import flash.text.TextFormat;')
replace('      private var char_equipped_senjutsu:Array = [];','''      private var char_equipped_senjutsu:Array = [];

      private var equipPage:int = 0;

      private var equipPager:MovieClip;

      private var equipPagerText:TextField;''')

replace('''         switch(Central.main.senjutsuSystem)
         {
            case 2:
               this.senjutsu_tag_list.push(_loc6_[this.SENJUTSU_TAG_TOAD]);
               this.senjutsu_tag_background_list.push(TIME_LINE.TOAD);
               break;
            case 3:
               this.senjutsu_tag_list.push(_loc6_[this.SENJUTSU_TAG_SNAKE]);
               this.senjutsu_tag_background_list.push(TIME_LINE.SNAKE);
         }''','''         if(this.hasSageGroup(3001,3010) || Central.main.senjutsuSystem == 2)
         {
            this.senjutsu_tag_list.push(_loc6_[this.SENJUTSU_TAG_TOAD]);
            this.senjutsu_tag_background_list.push(TIME_LINE.TOAD);
         }
         if(this.hasSageGroup(3101,3110) || Central.main.senjutsuSystem == 3)
         {
            this.senjutsu_tag_list.push(_loc6_[this.SENJUTSU_TAG_SNAKE]);
            this.senjutsu_tag_background_list.push(TIME_LINE.SNAKE);
         }''')
replace('''         if(this.char_equipped_senjutsu.length < Central.main.senjutsuSlot)''','''         if(this.char_equipped_senjutsu.length < this.getEquipLimit())''')
replace('''      public function onShow() : void
      {
         var _loc1_:Object = null;''','''      public function onShow() : void
      {
         if(this.equipPager != null)
         {
            this.equipPager.visible = false;
         }
         var _loc1_:Object = null;''')
replace('''      public function initSenjutsuTreePage() : void
      {
         var _loc1_:MovieClip = this;''','''      public function initSenjutsuTreePage() : void
      {
         if(this.equipPager != null)
         {
            this.equipPager.visible = false;
         }
         var _loc1_:MovieClip = this;''')

a=s.index('      private function updateEquippedSenjutsu() : void')
b=s.index('      private function addDynamicTooltip(',a)
method=s[a:b]
method=method.replace('if(_loc3_ < Central.main.senjutsuSlot)','if(this.equipPage * 8 + _loc3_ < this.getEquipLimit())')
method=method.replace('if(_loc3_ < this.char_equipped_senjutsu.length)','if(this.equipPage * 8 + _loc3_ < this.char_equipped_senjutsu.length)')
method=method.replace('this.char_equipped_senjutsu[_loc3_]','this.char_equipped_senjutsu[this.equipPage * 8 + _loc3_]')
method=method.replace('''               else
               {
                  _loc10_["skill_" + _loc3_].filters = [this.dimFilter];
               }''','''               else
               {
                  _loc10_["skill_" + _loc3_].skill_id = null;
                  _loc10_["skill_" + _loc3_].filters = [this.dimFilter];
               }''')
method=method.replace('''            _loc3_++;
         }
      }''','''            _loc3_++;
         }
         this.updateEquipPager();
      }''')
if 'this.updateEquipPager();' not in method: raise RuntimeError('Pager hook missing')
s=s[:a]+method+s[b:]

at=s.index('      private function addDynamicTooltip(')
s=s[:at]+'''      private function hasSageGroup(first:int,last:int) : Boolean
      {
         for each(var entry:Object in Central.main.getMainChar().senjutsu)
         {
            if(int(entry.skill_id) >= first && int(entry.skill_id) <= last)
            {
               return true;
            }
         }
         return false;
      }

      private function getEquipLimit() : int
      {
         var active:int = 0;
         for each(var entry:Object in Central.main.getMainChar().getSenjutsuListArr())
         {
            if(entry.skill_id != "3000")
            {
               active++;
            }
         }
         return Math.max(Central.main.senjutsuSlot,active);
      }

      private function updateEquipPager() : void
      {
         var pages:int = Math.max(1,Math.ceil(this.getEquipLimit() / 8));
         if(this.equipPage >= pages)
         {
            this.equipPage = pages - 1;
         }
         if(this.equipPager == null)
         {
            this.equipPager = new MovieClip();
            this.equipPager.graphics.beginFill(5592310,0.98);
            this.equipPager.graphics.lineStyle(2,16759324);
            this.equipPager.graphics.drawRoundRect(0,0,92,27,8);
            this.equipPager.graphics.endFill();
            this.equipPager.buttonMode = true;
            this.equipPager.useHandCursor = true;
            this.equipPager.mouseChildren = false;
            this.equipPagerText = new TextField();
            this.equipPagerText.defaultTextFormat = new TextFormat("_sans",13,16777215,true);
            this.equipPagerText.width = 92;
            this.equipPagerText.height = 25;
            this.equipPagerText.selectable = false;
            this.equipPagerText.mouseEnabled = false;
            this.equipPager.addChild(this.equipPagerText);
            this.equipPager.addEventListener(MouseEvent.CLICK,this.onEquipNext);
         }
         if(this.equipPager.parent != this)
         {
            this.addChild(this.equipPager);
         }
         this.equipPager.x = 842;
         this.equipPager.y = 519;
         this.equipPagerText.text = "Next " + (this.equipPage + 1) + "/" + pages;
         this.equipPager.visible = pages > 1;
      }

      private function onEquipNext(event:MouseEvent) : void
      {
         this.equipPage = (this.equipPage + 1) % Math.max(1,Math.ceil(this.getEquipLimit() / 8));
         this.updateEquippedSenjutsu();
      }

'''+s[at:]
patched=work/'SenjutsuProfile.as'
patched.write_text(s)
out=work/'SenjutsuProfile.swf'
subprocess.run(cmd+['-replace',str(original),str(out),'ninjasaga.linkage.SenjutsuProfile',str(patched)],check=True,stdout=subprocess.DEVNULL)
verify=work/'verify'
subprocess.run(cmd+['-export','script',str(verify),str(out)],check=True,stdout=subprocess.DEVNULL)
v=(verify/'scripts/ninjasaga/linkage/SenjutsuProfile.as').read_text()
for needle in ['onEquipNext','hasSageGroup','this.equipPage * 8 + _loc3_','getEquipLimit']:
    assert needle in v,needle
print(out)
print('Input',original.stat().st_size,'output',out.stat().st_size)
