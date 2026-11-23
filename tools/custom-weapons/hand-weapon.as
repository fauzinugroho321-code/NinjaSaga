package {
 import flash.display.DisplayObjectContainer;
 import flash.display.MovieClip;
 import flash.events.Event;
 import flash.geom.Matrix;
 import flash.utils.getTimer;

 // Position settings are baked into the bitmap child. Keep its origin on
 // the left wrist regardless of which animated weapon holder the game uses.
 public dynamic class weapon extends MovieClip {
  private var characterHost:MovieClip;
  private var frameDelays:Array = [/*__FRAME_DELAYS__*/100];
  private var started:int = 0;
  private var artworkClip:MovieClip;
  private function animateArtwork():void {
   if(artworkClip==null||frameDelays.length<2)return;
   var duration:int=0;var i:int;
   for(i=0;i<frameDelays.length;i++)duration+=int(frameDelays[i]);
   var elapsed:int=(getTimer()-started)%duration;
   for(i=0;i<frameDelays.length-1&&elapsed>=int(frameDelays[i]);i++)elapsed-=int(frameDelays[i]);
   if(artworkClip.currentFrame!=i+1)artworkClip.gotoAndStop(i+1);
  }
  public function weapon() {
   super();stop();mouseEnabled=false;mouseChildren=false;
   addEventListener(Event.ADDED_TO_STAGE,onAdded,false,0,true);
   addEventListener(Event.REMOVED_FROM_STAGE,onRemoved,false,0,true);
  }
  private function onAdded(event:Event):void {
   if(event.target!=this)return;characterHost=null;started=getTimer();
   artworkClip=("artwork" in this)?this["artwork"] as MovieClip:null;
   if(artworkClip!=null)artworkClip.gotoAndStop(1);
   followHand(null);
   addEventListener(Event.EXIT_FRAME,followHand,false,0,true);
  }
  private function onRemoved(event:Event):void {
   if(event.target!=this)return;removeEventListener(Event.EXIT_FRAME,followHand);
   if(artworkClip!=null)artworkClip.stop();artworkClip=null;
   characterHost=null;transform.matrix=new Matrix();visible=true;
  }
  private function findCharacter():MovieClip {
   var candidate:DisplayObjectContainer=parent;var depth:int=0;
   while(candidate!=null&&depth<8){
    if(candidate is MovieClip&&"left_hand" in candidate&&"right_hand" in candidate)return candidate as MovieClip;
    candidate=candidate.parent;depth++;
   }
   return null;
  }
  private function followHand(event:Event):void {
   animateArtwork();
   if(parent==null)return;
   if(characterHost==null||!characterHost.contains(this))characterHost=findCharacter();
   // Gear's isolated model has no character rig. Leave its normal transform.
   if(characterHost==null)return;
   var hand:MovieClip=characterHost["left_hand"] as MovieClip;
   if(hand==null||!hand.visible){visible=false;return;}
   var owner:Matrix=parent.transform.concatenatedMatrix;
   if(Math.abs(owner.a*owner.d-owner.b*owner.c)<0.00001){visible=false;return;}
   owner.invert();var placement:Matrix=new Matrix(1,0,0,1,0,8);
   placement.concat(hand.transform.concatenatedMatrix);placement.concat(owner);
   transform.matrix=placement;visible=true;
  }
 }
}
