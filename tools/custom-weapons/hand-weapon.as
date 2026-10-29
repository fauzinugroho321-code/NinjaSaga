package {
 import flash.display.DisplayObjectContainer;
 import flash.display.MovieClip;
 import flash.events.Event;
 import flash.geom.Matrix;

 // Position settings are baked into the bitmap child. Keep its origin on
 // the left wrist regardless of which animated weapon holder the game uses.
 public dynamic class weapon extends MovieClip {
  private var characterHost:MovieClip;
  public function weapon() {
   super();stop();mouseEnabled=false;mouseChildren=false;
   addEventListener(Event.ADDED_TO_STAGE,onAdded,false,0,true);
   addEventListener(Event.REMOVED_FROM_STAGE,onRemoved,false,0,true);
  }
  private function onAdded(event:Event):void {
   if(event.target!=this)return;characterHost=null;followHand(null);
   addEventListener(Event.EXIT_FRAME,followHand,false,0,true);
  }
  private function onRemoved(event:Event):void {
   if(event.target!=this)return;removeEventListener(Event.EXIT_FRAME,followHand);
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
