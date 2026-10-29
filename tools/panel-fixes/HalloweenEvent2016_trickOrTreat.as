package ninjasaga.linkage
{
   import com.utils.CreateFilter;
   import com.utils.GF;
   import com.utils.Out;
   import flash.display.MovieClip;
   import flash.events.MouseEvent;
   import flash.filters.ColorMatrixFilter;
   import flash.system.Capabilities;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.geom.Rectangle;
   import ninjasaga.Central;
   import ninjasaga.data.ButtonData;
   import ninjasaga.data.Timeline;
   
   [SWF(width="960", height="780", backgroundColor="#999999", frameRate="24")]
   [SWF(frameRate="24",backgroundColor="#999999",width="960",height="780")]
   [SWF(frameRate="24",backgroundColor="#999999",width="960",height="780")]
   public class HalloweenEvent2016_trickOrTreat extends MovieClip
   {
      
      public var panelMc:MovieClip;
      
      private var dimFilter:ColorMatrixFilter = CreateFilter.getSaturationFilter(0);
      
      private const CHAR_GENDER:int = int(Central.main.getMainChar().getGender());
      
      private var langArr:Array;
      
      private var buttonText:Array = [ButtonData.BUY,ButtonData.UPGRADE];
      
      private var isEmblem:Boolean;
      
      private var currentBuyId:int;
      private var desktopLayoutApplied:Boolean = false;
      private var rewardGenderApplied:Boolean = false;
      
      private var halloweenPrizeList:Array = ["pet_194","wpn_1337","wpn_1338","wpn_1339","wpn_1340","back_614","set_2212","set_2214","skill_723","hair_673","hair_675"];
      
      public function HalloweenEvent2016_trickOrTreat()
      {
         super();
         this.langArr = Central.main.langLib.get(2036);
      }
      
      public function show(param1:String = null) : void
      {
         this["panelMc"].gotoAndPlay(Timeline.SHOW);
      }
      
      public function onShow(param1:MovieClip) : void
      {
         var _loc2_:int = 0;
         var _loc3_:Array = null;
         var _loc4_:int = 0;
         trace("mc=" + param1);
         trace("mc=" + GF.printObject(param1));
         param1 = param1["panel"];
         if(!this.desktopLayoutApplied && (Capabilities.playerType == "Desktop" || Capabilities.playerType == "Mobile"))
         {
            this.desktopLayoutApplied = true;
            param1.x += 120;
            param1.scaleY = 0.7;
         }
         if(!this.rewardGenderApplied && int(Central.main.getMainChar().getGender()) == 1)
         {
            this.rewardGenderApplied = true;
            _loc2_ = 0;
            while(_loc2_ < this.halloweenPrizeList.length)
            {
               _loc3_ = this.halloweenPrizeList[_loc2_].split("_");
               _loc4_ = int(_loc3_[1]);
               if(String(_loc3_[0]).indexOf("hair") >= 0 || String(_loc3_[0]).indexOf("set") >= 0)
               {
                  _loc4_ += 1;
                  this.halloweenPrizeList[_loc2_] = _loc3_[0] + "_" + _loc4_;
               }
               _loc2_++;
            }
         }
         if(!param1["btnClose"].hasEventListener(MouseEvent.CLICK))
         {
            param1["btnClose"].addEventListener(MouseEvent.CLICK,this.hide);
         }
         if(!param1["btnHelp"].hasEventListener(MouseEvent.CLICK))
         {
            param1["btnHelp"].addEventListener(MouseEvent.CLICK,this.showHitsPopup);
         }
         if(this.langArr == null && Central.main && Central.main.langLib)
         {
            this.langArr = Central.main.langLib.get(2036);
         }
         if(param1["titleTxt"])
         {
            param1["titleTxt"].text = this.langArr != null && this.langArr[0] != null ? this.langArr[0] : "Halloween Event 2026";
         }
         this.updateButton();
      }
      
      private function localizedLabel(index:int, fallback:String) : String
      {
         if(this.langArr == null || this.langArr[index] == null)
         {
            return fallback;
         }
         var value:String = String(this.langArr[index]);
         return value.replace(/\s/g, "").length > 0 ? value : fallback;
      }

      private function initLabeledButton(button:MovieClip, handler:Function, caption:String) : void
      {
         Central.main.initButton(button,handler,caption);
         button.mouseChildren = false;
         button.buttonMode = true;
         var original:TextField = button["txt"] as TextField;
         var container:MovieClip = button.parent as MovieClip;
         if(original == null || container == null)
         {
            return;
         }
         // Keep the caption outside the animated, filtered button timeline.
         var key:String = button.name + "LocalCaption";
         var label:TextField = container.getChildByName(key) as TextField;
         if(label == null)
         {
            label = new TextField();
            label.name = key;
            label.embedFonts = false;
            label.selectable = false;
            label.mouseEnabled = false;
            container.addChild(label);
         }
         var bounds:Rectangle = original.getBounds(container);
         label.x = bounds.x;
         label.y = bounds.y - 2;
         label.width = Math.max(100,bounds.width);
         label.height = Math.max(50,bounds.height + 12);
         label.defaultTextFormat = new TextFormat("_sans",Math.min(34,20 * Math.abs(button.scaleY)),16777215,true,null,null,null,null,"center");
         label.text = caption;
         label.visible = true;
         original.visible = false;
         container.setChildIndex(label,container.getChildIndex(button) + 1);
      }

      private function updateButton() : void
      {
         var panel:MovieClip = this["panelMc"]["panel"];
         if(panel == null)
         {
            return;
         }
         panel["trickOrTreatBtn"].visible = true;
         panel["battleBtn"].visible = true;
         panel["prizeListBtn"].visible = true;
         this.initLabeledButton(panel["trickOrTreatBtn"],this.showTrickOrTreatPopup,this.localizedLabel(13,"Trick or Treat"));
         this.initLabeledButton(panel["battleBtn"],this.goToBattle,this.localizedLabel(12,"Battle"));
         this.initLabeledButton(panel["prizeListBtn"],this.showPrizeListPopup,this.localizedLabel(11,"Rewards List"));
      }

      private function goToBattle(param1:MouseEvent) : void
      {
         Central.panel.getInstance().show("Halloween_battle_2016");
      }
      
      private function showPrizeListPopup(param1:MouseEvent) : void
      {
         this["panelMc"]["panel"]["popupPrizeListMc"].gotoAndPlay(Timeline.SHOW);
      }
      
      public function hidePrizeListPopup(param1:MouseEvent = null) : void
      {
         this["panelMc"]["panel"]["popupPrizeListMc"].gotoAndPlay(Timeline.EXIT);
      }
      
      public function onShowPrizeList(param1:MovieClip) : void
      {
         var _loc2_:MovieClip = param1["panel"];
         var _loc3_:int = 0;
         _loc2_["titleTxt"].text = this.langArr[11];
         _loc2_["btnClose"].addEventListener(MouseEvent.CLICK,this.hidePrizeListPopup);
         this.initLabeledButton(_loc2_["goMaterialBtn"],this.goMaterialHouse,this.localizedLabel(10,"Go to Crafting"));
         _loc3_ = 0;
         while(_loc3_ < this.halloweenPrizeList.length)
         {
            this.setRewardIcon(_loc2_["iconMc_" + _loc3_],this.halloweenPrizeList[_loc3_]);
            Out.debug("Timmy","rewardItem_" + _loc3_ + " : " + this.halloweenPrizeList[_loc3_]);
            _loc3_++;
         }
         _loc3_ = 1;
         while(_loc3_ <= 6)
         {
            _loc2_["dec" + _loc3_ + "Txt"].text = this.langArr[_loc3_ + 3];
            _loc3_++;
         }
      }
      
      private function goMaterialHouse(param1:MouseEvent) : void
      {
         Central.panel.getInstance().show("material_house");
      }
      
      private function showHitsPopup(param1:MouseEvent = null) : void
      {
         this["panelMc"]["panel"]["popupHitsMc"].gotoAndPlay(Timeline.SHOW);
      }
      
      public function hideHitsPopup(param1:MouseEvent = null) : void
      {
         this["panelMc"]["panel"]["popupHitsMc"].gotoAndPlay(Timeline.EXIT);
      }
      
      public function onShowHits(param1:MovieClip) : void
      {
         var _loc2_:MovieClip = param1["panel"];
         _loc2_["titleTxt"].text = this.langArr[1];
         _loc2_["detailTxt"].text = this.langArr[2];
         _loc2_["btnClose"].addEventListener(MouseEvent.CLICK,this.hideHitsPopup);
      }
      
      private function showTrickOrTreatPopup(param1:MouseEvent) : void
      {
         this["panelMc"]["panel"]["popupSendTrickOrTreatMc"].gotoAndPlay(Timeline.SHOW);
      }
      
      public function hideTrickOrTreatPopup(param1:MouseEvent = null) : void
      {
         this["panelMc"]["panel"]["popupSendTrickOrTreatMc"].gotoAndPlay(Timeline.EXIT);
      }
      
      public function onShowTrickOrTreatPopup(param1:MovieClip) : void
      {
         var _loc2_:MovieClip = param1["panel"];
         _loc2_["btnClose"].addEventListener(MouseEvent.CLICK,this.hideTrickOrTreatPopup);
         _loc2_["titleTxt"].text = this.langArr[13];
         this.initLabeledButton(_loc2_["askBtn"],this.goToSendTrickOrTreat,this.localizedLabel(14,"Ask Friends"));
      }
      
      private function goToSendTrickOrTreat(param1:MouseEvent) : void
      {
         var _loc2_:Array = Central.main.langLib.get(2036);
         Central.sns.sendRequestNotify(_loc2_[17],_loc2_[13],"request_item","item_1026");
         this.hideTrickOrTreatPopup();
      }
      
      public function hide(param1:MouseEvent = null) : void
      {
         this["panelMc"].gotoAndPlay(Timeline.EXIT);
      }
      
      public function onExit() : void
      {
         Central.panel.getInstance().hide(this);
      }
      
      private function setRewardIcon(param1:MovieClip, param2:String) : *
      {
         var _loc3_:Object = null;
         var _loc4_:Array = [];
         GF.removeAllChild(param1["skillIcon"]["iconHolder"]);
         GF.removeAllChild(param1["rewardIcon"]["iconHolder"]);
         _loc4_ = param2.split("_");
         if(String(_loc4_[0]).indexOf("null") >= 0)
         {
            param1.visible = false;
            Central.main.hideDynamicTooltip(param1);
            return;
         }
         param1.visible = true;
         _loc3_ = Central.main.toolkit.getDisplayData(String(_loc4_[0] + _loc4_[1]));
         if(String(_loc4_[0]).indexOf("skill") >= 0)
         {
            param1["skillIcon"].visible = true;
            param1["rewardIcon"].visible = false;
            param1["skillIcon"]["iconHolder"].addChild(_loc3_.mc);
         }
         else
         {
            param1["rewardIcon"].visible = true;
            param1["skillIcon"].visible = false;
            param1["rewardIcon"]["iconHolder"].addChild(_loc3_.mc);
            if(_loc4_.length > 2)
            {
               _loc3_.amount = Number(_loc4_[2]);
            }
         }
         Central.main.showDynamicTooltip(param1,"<font size=\'16\'>" + _loc3_.tooltip + "</font>");
      }
   }
}

