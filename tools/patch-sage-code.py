"""Patch the current local code_library SWF for eight Sage slots and SP modes."""
from pathlib import Path
import subprocess, tempfile, sys
root=Path(sys.argv[1]).resolve()
original=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else root/'web/cdn/swf/latest/swf/library/code_library.swf'
jar=root/'tools/ffdec/ffdec.jar'
work=Path(tempfile.mkdtemp(prefix='ninja-sage-code-'))
cmd=['java','-Xmx2g','-Duser.home='+str(work),'-Djava.awt.headless=true','-jar',str(jar)]
source=work/'source'
subprocess.run(cmd+['-export','script',str(source),str(original)],check=True,stdout=subprocess.DEVNULL)

def edit(classname,fn,input_swf):
    path=source/'scripts'/Path(classname.replace('.','/')+'.as')
    body=path.read_text()
    body=fn(body)
    modified=work/(classname.split('.')[-1]+'.as')
    modified.write_text(body)
    output=work/(classname.split('.')[-1]+'.swf')
    subprocess.run(cmd+['-replace',str(input_swf),str(output),classname,str(modified)],check=True,stdout=subprocess.DEVNULL)
    return output

def once(body,old,new):
    if body.count(old)!=1: raise RuntimeError(f'Expected one match, found {body.count(old)}: {old[:80]}')
    return body.replace(old,new)

def parser(body):
    return once(body,'''            if(extraData.senjutsu_system)
            {
               Central.main.senjutsuSystem = extraData.senjutsu_system;
            }''','''            if(extraData.senjutsu_system)
            {
               Central.main.senjutsuSystem = extraData.senjutsu_system;
            }
            var sageSpMode:int = Math.max(0,Math.min(2,int(extraData.sage_sp_mode)));
            Central.main.getMainChar().updateData(DBCharacterData.MAX_SP,1 + sageSpMode);
            if(sageSpMode > 0)
            {
               Central.main.getMainChar().updateData(DBCharacterData.SP,Central.main.getMainChar().maxSP);
            }''')

def character_base(body):
    body=once(body,'''      public function get maxSP() : uint
      {
         return Formula.calcSP(this) + this.spBonus;
      }''','''      public function get maxSP() : uint
      {
         if(this.getData(DBCharacterData.MAX_SP) == 3)
         {
            return 9999;
         }
         return Formula.calcSP(this) + this.spBonus;
      }''')
    a=body.index('      public function updateSP(param1:int) : uint')
    b=body.index('      public function updateSPstatus(',a)
    method=body[a:b]
    method=once(method,'         _loc2_ += param1;','''         if(Central.main.getMainChar() != null && this.getCharacterId() == Central.main.getMainChar().getCharacterId() && this.getData(DBCharacterData.MAX_SP) == 3)
         {
            _loc2_ = int(this.maxSP);
         }
         else
         {
            _loc2_ += param1;
         }''')
    body=body[:a]+method+body[b:]
    a=body.index('      public function updateSPstatus(')
    b=body.index('      public function getTradingWeapon()',a)
    method=body[a:b]
    method=once(method,'         switch(param1)','''         if(Central.main.getMainChar() != null && this.getCharacterId() == Central.main.getMainChar().getCharacterId() && this.getData(DBCharacterData.MAX_SP) == 2)
         {
            this.updateData(DBCharacterData.SP,this.maxSP);
            return;
         }
         switch(param1)''')
    return body[:a]+method+body[b:]

def character_display(body):
    a=body.index('      public function syncSp(param1:int) : void')
    b=body.index('      override public function updateHP(',a)
    method=body[a:b]
    method=once(method,'         var _loc2_:int = param1;','''         var _loc2_:int = param1;
         if(Central.main.getMainChar() != null && this.getCharacterId() == Central.main.getMainChar().getCharacterId() && this.getData(DBCharacterData.MAX_SP) == 3)
         {
            _loc2_ = 9999;
         }''')
    return body[:a]+method+body[b:]

def formula(body):
    a=body.index('      public static function getSenjutsuSlot(')
    b=body.index('      public static function getXpByLv(',a)
    return body[:a]+'''      public static function getSenjutsuSlot(param1:uint) : int
      {
         return param1 >= SenjutsuData.SENJUTSU_LEVEL ? 8 : 0;
      }
      
'''+body[b:]

out=original
for name,fn in [('ninjasaga.DataParser',parser),('ninjasaga.base.CharacterBase',character_base),('ninjasaga.base.CharacterDisplay',character_display),('ninjasaga.data.Formula',formula)]:
    out=edit(name,fn,out)
verify=work/'verify'
subprocess.run(cmd+['-export','script',str(verify),str(out)],check=True,stdout=subprocess.DEVNULL)
checks={
 'ninjasaga/DataParser.as':'sageSpMode:int',
 'ninjasaga/base/CharacterBase.as':'this.getData(DBCharacterData.MAX_SP) == 3',
 'ninjasaga/base/CharacterDisplay.as':'_loc2_ = 9999;',
 'ninjasaga/data/Formula.as':'return param1 >= SenjutsuData.SENJUTSU_LEVEL ? 8 : 0;',
}
for file,needle in checks.items():
    assert needle in (verify/'scripts'/file).read_text(),needle
print(out)
print('Input',original.stat().st_size,'output',out.stat().st_size)
