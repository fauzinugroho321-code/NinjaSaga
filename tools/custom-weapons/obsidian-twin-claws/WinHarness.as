package {
 import flash.display.*;
 import flash.events.*;
 import flash.geom.*;
 import flash.net.*;
 import flash.system.*;
 import flash.text.*;
 import flash.utils.*;
 public class WinHarness extends MovieClip {
  private var domains:Array=[];
  private var resources:Array=["build/data_library_en.swf","build/wpn_9000.swf","action-win-fixed.swf","assets/cdn/swf/latest/swf/items/set_1110_0.swf","assets/cdn/swf/latest/swf/items/hair_19_0.swf","assets/cdn/swf/latest/swf/items/face_01_0.swf"];
  private var chars:Array=[];
  private var blades:Array=[];
  private var ticks:int=0;
  private var hitCount:int=0;
  private var finishCount:int=0;
  public function WinHarness(){super();stop();addEventListener(Event.ADDED_TO_STAGE,ready);}
  private function ready(e:Event):void {removeEventListener(Event.ADDED_TO_STAGE,ready);stage.scaleMode=StageScaleMode.NO_SCALE;stage.align=StageAlign.TOP_LEFT;next();}
  private function next():void {
   if(domains.length==resources.length){run();return;}
   var loader:Loader=new Loader();
   loader.contentLoaderInfo.addEventListener(Event.COMPLETE,loaded);
   loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,function(e:Event):void {trace("CLAW_TEST_FAIL load "+e);});
   loader.load(new URLRequest("http://127.0.0.1:8091/"+resources[domains.length]),new LoaderContext(false,new ApplicationDomain(null)));
  }
  private function loaded(e:Event):void {domains.push((e.target as LoaderInfo).applicationDomain);next();}
  private function make(index:int,name:String):MovieClip {var cls:Class=domains[index].getDefinition(name) as Class;return new cls() as MovieClip;}
  private function label(value:String,x:Number,y:Number):void {var t:TextField=new TextField();t.defaultTextFormat=new TextFormat("_sans",22,0xF5DAB5,true);t.width=960;t.height=40;t.x=x;t.y=y;t.text=value;addChild(t);}
  private function skin(mc:MovieClip):void {
   var parts:Array=["upper_body","lower_body","left_upper_arm","left_lower_arm","left_hand","left_upper_leg","left_lower_leg","left_shoe","right_upper_arm","right_lower_arm","right_hand","right_upper_leg","right_lower_leg","right_shoe"];
   for each(var name:String in parts){while(mc[name].numChildren)mc[name].removeChildAt(0);mc[name].addChild(make(3,name));}
   mc.head.hair.addChild(make(4,"hair"));mc.head.face.addChild(make(5,"face"));mc.back_hair.addChild(make(4,"back_hair"));
  }
  private function equip(mc:MovieClip):MovieClip {
   while(mc.weapon.numChildren)mc.weapon.removeChildAt(0);while(mc.handweapon.numChildren)mc.handweapon.removeChildAt(0);var holder:MovieClip=new MovieClip();holder.exportName="weapon";mc.handweapon.addChild(holder);
   var w:MovieClip=make(1,"weapon");holder.addChild(w);return w;
  }
  private function run():void {
   try {
    var lib:MovieClip=make(0,"ninjasaga.language.DataLibraryEN");var data:Object=lib.getWeapon();
    if(data.wpn9000.name!="Obsidian Twin Claws"||data.wpn1.name!="Kunai"||data.wpn1596.name!="Six-Element Gauntlet")throw new Error("catalog");
    trace("CLAW_TEST catalog PASS damage="+data.wpn9000.damage+" animation="+data.wpn9000.animation);
    graphics.beginFill(0x363036);graphics.drawRect(0,0,1000,650);graphics.endFill();
    label("Obsidian Twin Claws | real attack and victory callbacks",25,20);
    for(var i:int=0;i<2;i++){
     var mc:MovieClip=make(2,"ActionBase");mc.gotoAndStop(10);skin(mc);mc.x=260+i*425;mc.y=500;mc.scaleX=mc.scaleY=1.6;addChild(mc);chars.push(mc);blades.push(equip(mc));
    }
    var icon:MovieClip=make(1,"icon");icon.x=905;icon.y=200;icon.scaleX=icon.scaleY=0.95;addChild(icon);
    label("Attack complete / victory pose",25,570);
    addEventListener(Event.ENTER_FRAME,tick);
   }catch(e:Error){trace("CLAW_TEST_FAIL "+e.getStackTrace());}
  }
  private function checkHand(w:MovieClip,mc:MovieClip):void {
   var left:MovieClip=w.leftBlade;var right:MovieClip=w.rightBlade;
   if(!left||!right||left===right||!left.visible||!right.visible)throw new Error("two blades missing");
   var expected:Point=mc.left_hand.localToGlobal(new Point(0,8));
   var actual:Point=left.localToGlobal(new Point(850,440));
   if(Point.distance(expected,actual)>0.25)throw new Error("left wrist drift "+Point.distance(expected,actual));
   expected=mc.right_hand.localToGlobal(new Point(0,8));actual=right.localToGlobal(new Point(850,440));
   if(Point.distance(expected,actual)>0.25)throw new Error("right wrist drift "+Point.distance(expected,actual));
  }
  private function tick(e:Event):void {
   ticks++;
   try {
    if(ticks==5){
     if(!("gotoWin_TypeAttack10" in chars[0]))throw new Error("victory alias missing");
     chars[0].setAttackHitCB(function():void {hitCount++;});
     chars[0].setActionFinishCB(function():void {finishCount++;});
     chars[0].gotoAction("attack_10");
     chars[1].gotoWin_TypeAttack10();
    }
    if(ticks==40){
     if(hitCount!=1||finishCount!=1||chars[0].currentFrame!=774)throw new Error("attack callback contract: "+hitCount+"/"+finishCount+" frame="+chars[0].currentFrame);
     if(chars[1].currentFrame!=340)throw new Error("victory did not finish at frame 340");
     checkHand(blades[0],chars[0]);checkHand(blades[1],chars[1]);
     trace("CLAW_WIN_TEST real attack hit/finish callbacks PASS");
     trace("CLAW_WIN_TEST victory alias and both wrists PASS");
     capture("victory-preview");
     chars[0].gotoWin_TypeAttack10();chars[1].gotoWin();
    }
    if(ticks==70){
     if(chars[0].currentFrame!=340||chars[1].currentFrame!=340)throw new Error("alias differs from existing victory");
     if(hitCount!=1||finishCount!=1)throw new Error("victory triggered attack callbacks");
     trace("CLAW_WIN_TEST existing and alias victory equivalent PASS");
     trace("CLAW_WIN_TEST_ALL_PASS");removeEventListener(Event.ENTER_FRAME,tick);
    }
   }catch(err:Error){removeEventListener(Event.ENTER_FRAME,tick);trace("CLAW_WIN_TEST_FAIL "+err.getStackTrace());}
  }
  private function capture(name:String):void {
   var bmp:BitmapData=new BitmapData(1000,650,true,0);bmp.draw(this);
   var req:URLRequest=new URLRequest("http://127.0.0.1:8091/capture?w=1000&h=650&name="+name);req.method=URLRequestMethod.POST;req.contentType="application/octet-stream";req.data=bmp.getPixels(bmp.rect);
   var sender:URLLoader=new URLLoader();sender.load(req);bmp.dispose();
  }
 }
}
