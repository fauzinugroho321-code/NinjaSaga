package {
 import flash.display.*;
 import flash.events.*;
 import flash.geom.*;
 import flash.net.*;
 import flash.system.*;
 import flash.text.*;
 import flash.utils.*;
 public class PoseHarness extends MovieClip {
  private var domains:Array=[];
  private var resources:Array=["build/data_library_en.swf","build/wpn_9000.swf","action-poses.swf","assets/cdn/swf/latest/swf/items/set_1110_0.swf","assets/cdn/swf/latest/swf/items/hair_19_0.swf","assets/cdn/swf/latest/swf/items/face_01_0.swf"];
  private var chars:Array=[];
  private var blades:Array=[];
  private var ticks:int=0;
  public function PoseHarness(){super();stop();addEventListener(Event.ADDED_TO_STAGE,ready);}
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
    label("Obsidian Twin Claws | rear blade behind body",25,20);
    for(var i:int=0;i<2;i++){
     var mc:MovieClip=make(2,"StaticFullBody");mc.gotoAndStop(i==0 ? 10 : 758);skin(mc);mc.x=220+i*440;mc.y=310;mc.scaleX=-0.85;mc.scaleY=0.85;addChild(mc);chars.push(mc);blades.push(equip(mc));
    }
    var icon:MovieClip=make(1,"icon");icon.x=905;icon.y=200;icon.scaleX=icon.scaleY=0.95;addChild(icon);
    label("Battle idle / claw strike pose",25,570);
    addEventListener(Event.ENTER_FRAME,tick);
   }catch(e:Error){trace("CLAW_TEST_FAIL "+e.message+" "+e.getStackTrace());}
  }
  private function checkHand(w:MovieClip,mc:MovieClip):void {
   var left:MovieClip=w.leftBlade;var right:MovieClip=w.rightBlade;
   if(right.parent!==mc.right_hand)throw new Error("Rear blade is not in rear hand layer");
   if(mc.getChildIndex(mc.right_hand)>=mc.getChildIndex(mc.upper_body))throw new Error("Rear hand must be behind torso");
   if(left.parent!==w)throw new Error("Front blade lost weapon ownership");
   if(!left||!right||left===right||!left.visible||!right.visible)throw new Error("two blades missing: left="+left+" right="+right+" lv="+(left?left.visible:false)+" rv="+(right?right.visible:false)+" lh="+mc.left_hand+" rh="+mc.right_hand);
   var expected:Point=mc.left_hand.localToGlobal(new Point(0,8));
   var actual:Point=left.localToGlobal(new Point(850,440));
   if(Point.distance(expected,actual)>0.25)throw new Error("left wrist drift "+Point.distance(expected,actual));
   expected=mc.right_hand.localToGlobal(new Point(0,8));actual=right.localToGlobal(new Point(850,440));
   if(Point.distance(expected,actual)>0.25)throw new Error("right wrist drift "+Point.distance(expected,actual));
  }
  private function tick(e:Event):void {
   ticks++;
   try {
    if(ticks==10){checkHand(blades[0],chars[0]);checkHand(blades[1],chars[1]);for each(var blade:MovieClip in [blades[0].leftBlade,blades[0].rightBlade]){var grip:Point=blade.localToGlobal(new Point(850,440));var tip:Point=blade.localToGlobal(new Point(1760,440));if(tip.x<=grip.x||tip.y<=grip.y)throw new Error("Idle blade points backwards/upwards");trace("CLAW_ORIENTATION forward/down PASS dx="+(tip.x-grip.x)+" dy="+(tip.y-grip.y));}capture("battle-pose-preview");var height:Number=chars[0].left_shoe.getBounds(this).bottom-chars[0].head.getBounds(this).top;var length:Number=Point.distance(blades[0].leftBlade.localToGlobal(new Point(0,440)),blades[0].leftBlade.localToGlobal(new Point(1760,440)));trace("CLAW_SIZE blade="+length+" body="+height+" ratio="+(length/height));trace("CLAW_DEPTH rear hand occlusion PASS");trace("CLAW_TEST two independent wrists PASS");}
    if(ticks==20){chars[1].left_hand.rotation+=55;chars[1].right_hand.rotation-=40;chars[1].handweapon.rotation+=25;chars[1].handweapon.scaleX=0.7;chars[1].x+=20;}
    if(ticks==30){checkHand(blades[1],chars[1]);trace("CLAW_TEST transformed moving wrists PASS");}
    if(ticks==40){var w:MovieClip=blades[1];w.parent.removeChild(w);if(w.rightBlade.parent!==w||w.rightBlade.stage!=null||chars[1].right_hand.contains(w.rightBlade))throw new Error("Rear blade leaked on unequip");if(w.stage!=null||w.hasEventListener(Event.EXIT_FRAME))throw new Error("listener leaked on unequip");trace("CLAW_TEST unequip cleanup PASS");}
    if(ticks==50){blades[1]=equip(chars[1]);}
    if(ticks==60){checkHand(blades[1],chars[1]);capture("battle-transformed-preview");trace("CLAW_TEST re-equip PASS");for(var frame:int=750;frame<=774;frame++){chars[0].gotoAndStop(frame);blades[0].dispatchEvent(new Event(Event.EXIT_FRAME));checkHand(blades[0],chars[0]);}trace("CLAW_TEST all 25 attack_10 pose frames PASS");}
    if(ticks==70){removeChild(chars[1]);if(blades[1].rightBlade.parent!==blades[1]||blades[1].rightBlade.stage!=null)throw new Error("rear blade leaked on whole-character removal");}
    if(ticks==75){addChild(chars[1]);}
    if(ticks==85){checkHand(blades[1],chars[1]);trace("CLAW_DEPTH whole-character remove/re-add PASS");chars[1].right_hand.alpha=0.5;blades[1].dispatchEvent(new Event(Event.EXIT_FRAME));if(blades[1].rightBlade.alpha!=1)throw new Error("rear hand alpha applied twice");trace("CLAW_DEPTH inherited rear-hand opacity PASS");removeEventListener(Event.ENTER_FRAME,tick);trace("CLAW_TEST_ALL_PASS");}
   }catch(err:Error){removeEventListener(Event.ENTER_FRAME,tick);capture("pose-failure");trace("CLAW_TEST_FAIL "+err.message+" "+err.getStackTrace());}
  }
  private function capture(name:String):void {
   var bmp:BitmapData=new BitmapData(1000,650,true,0);bmp.draw(this);
   var req:URLRequest=new URLRequest("http://127.0.0.1:8091/capture?w=1000&h=650&name="+name);req.method=URLRequestMethod.POST;req.contentType="application/octet-stream";req.data=bmp.getPixels(bmp.rect);
   var sender:URLLoader=new URLLoader();sender.load(req);bmp.dispose();
  }
 }
}
