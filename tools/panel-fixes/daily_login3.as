package ninjasaga.linkage
{
   import com.utils.CreateFilter;
   import com.utils.GF;
   import com.utils.Out;
   import flash.display.MovieClip;
   import flash.events.MouseEvent;
   import flash.utils.setTimeout;
   import flash.filters.ColorMatrixFilter;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import gs.easing.*;
   import ninjasaga.Account;
   import ninjasaga.Central;
   import ninjasaga.Item;
   import ninjasaga.data.AppData;
   import ninjasaga.data.ButtonData;
   import ninjasaga.data.DBCharacterData;
   import ninjasaga.data.Data;
   import ninjasaga.data.Formula;
   import ninjasaga.data.InventoryData;
   import ninjasaga.data.SNSData;
   import ninjasaga.data.Timeline;
   import ninjasaga.data.TooltipData;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol486")]
   public class daily_login3 extends MovieClip
   {
      
      public var PanelMc:MovieClip;
      
      private var MAX_LOGINDAY:int = 3;
      
      private var PREMIUM_EXTRA_CARD:int = 1;
      
      private var isLevelUp:Boolean;
      
      private var loginDay:int;
      
      private var canWallFeed:Boolean = false;
      
      private var showRewardIcon:MovieClip;
      
      private var showRewardAmount:String;
      
      private var showRewardTooltip:String;
      
      private var showRewardType:String;
      
      private var scratchTokenPrice:int = 5;
      
      private var scratchType:String = "free";
      
      private var rewardArr:Array;
      
      private var haveScratchTime:int = 0;
      
      private var remainScratchTime:int;
      
      private var remainSpcScratchTime:int;
      
      private var selectScratch:int;
      
      private var langArr:Array = new Array();
      
      internal var charRank:int = Central.main.getMainChar().getData(DBCharacterData.RANK);
      
      internal var session_key:String = Central.main.account.getAccountSessionKey();
      
      private var dimFilter:ColorMatrixFilter = CreateFilter.getSaturationFilter(0);
      
      private var TestMode:Boolean = false;
      
      private var firstTimeGrand:Boolean = false;
      
      private var skillBase:String = "";
      
      private var iiconData:Object = null;
      
      private var specialGrandPrize:Array = ["TOKEN_2000","TOKEN_2000"];
      
      private var specialGrandPrizeRR:Array = ["SKILL_376","SKILL_377","SKILL_339"];
      
      private var specialGrand:Boolean = true;
      
      private var superPrize:String = "TOKEN_2000";
      
      private var PetID:String = "14";
      
      private var petObject:Object;
      
      private var pet_id:int;
      
      private var package_icon:String = "";
      
      private var package_hair:String = "";
      
      private var package_clothing:String = "";
      
      private var package_backitem:String = "back264";
      
      private const CHAR_GENDER:int = int(Central.main.getMainChar().getGender());
      
      public function daily_login3()
      {
         super();
         addFrameScript(0,this.frame1,9,this.frame10,19,this.frame20);
         this.langArr = Central.main.langLib.get(1630);
         this.skillBase = "skill401";
         if(this.CHAR_GENDER == 0)
         {
         }
         var _loc1_:int = int(Central.main.getMainChar().getLevel());
         this.loginDay = Math.max(1,int(Central.main.getMainChar().consecutiveDays));
         this.remainScratchTime = Central.main.dailyRoulette_remainTime;
         this.remainSpcScratchTime = Central.main.dailyRoulette_spc_remainTime;
         this.MAX_LOGINDAY = 3;
         this.PREMIUM_EXTRA_CARD = 1;
         if(AppData.type != AppData.RR)
         {
            this.MAX_LOGINDAY = 4;
            this.PREMIUM_EXTRA_CARD = 3;
         }
         if(this.loginDay >= this.MAX_LOGINDAY)
         {
            this.loginDay = this.MAX_LOGINDAY;
         }
      }
      
      public function show() : void
      {
         this.gotoAndPlay(Timeline.SHOW);
      }
      
      public function onShow() : void
      {
         var _loc1_:MovieClip = this["PanelMc"];
         this.stop();
         _loc1_["tokenTxt"].text = String(Account.getAccountBalance());
         Central.main.initButton(_loc1_["getMoreBtn"],this.getMoreToken,ButtonData.GETMORE);
         _loc1_["dailyScratch_Title"].text = this.langArr[0];
         _loc1_["txtWarning"].text = this.langArr[38];
         _loc1_["remainMc"].visible = false;
         _loc1_["scratchPanel"].gotoAndStop("standBy");
         if(AppData.type == AppData.RR)
         {
            _loc1_["dialogueMC"]["dialogueTxt"].text = this.langArr[42];
            _loc1_["DatePanel"].gotoAndStop("rr");
         }
         else
         {
            _loc1_["dialogueMC"].visible = false;
            _loc1_["scratchPanel"]["idlePost"]["worldHistoryBtn"].visible = false;
         }
         if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
         {
            this.haveScratchTime += this.PREMIUM_EXTRA_CARD;
         }
         switch(this.loginDay)
         {
            case 1:
               this.haveScratchTime += 1;
               break;
            case 2:
               this.haveScratchTime += 2;
               break;
            case 3:
               this.haveScratchTime += 3;
               break;
            case 4:
               this.haveScratchTime += 6;
               break;
            default:
               this.haveScratchTime += 1;
         }
         if(Central.main.getMainChar().isFan)
         {
            if(this.remainScratchTime == this.haveScratchTime)
            {
               this.canWallFeed = true;
               if(AppData.type == AppData.RR)
               {
                  _loc1_["popupFreeCard"].gotoAndPlay("show");
               }
               else
               {
                  this["PanelMc"]["remainMc"].visible = true;
                  this["PanelMc"]["remainMc"].gotoAndStop("left_" + this.haveScratchTime);
                  this.updatePanel();
               }
            }
            else
            {
               this["PanelMc"]["remainMc"].visible = true;
               this["PanelMc"]["remainMc"].gotoAndStop("left_" + this.haveScratchTime);
               this.updatePanel();
            }
         }
         else
         {
            this["PanelMc"]["remainMc"].visible = true;
            this["PanelMc"]["remainMc"].gotoAndStop("left_" + this.haveScratchTime);
            this.updatePanel();
         }
         this.updateDatePanel(_loc1_["DatePanel"]);
      }
      
      public function updateDatePanel(param1:MovieClip) : void
      {
         // A child's first frame can run before this panel's constructor is ready.
         if(this.langArr == null || param1 == null || param1["loginTree"] == null)
         {
            return;
         }
         param1["loginTree"].gotoAndStop("day" + this.loginDay);
         param1["loginTree"]["txtDay1"].text = this.langArr[21];
         param1["loginTree"]["txtDay2"].text = this.langArr[21];
         param1["loginTree"]["txtDay3"].text = this.langArr[21];
         param1["loginTree"]["txtDay4"].text = this.langArr[21];
         param1["loginTree"]["loginGetFreeTxt"].text = this.langArr[1];
         if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
         {
            param1["loginTree"]["extraScratchMc"].gotoAndStop("emblem");
            param1["loginTree"]["extraScratchMc"]["extraTxt"].text = this.langArr[20];
            this.configureEmblemBonus(param1["loginTree"]["extraScratchMc"]);
            setTimeout(this.configureEmblemBonus,1,param1["loginTree"]["extraScratchMc"]);
         }
         else
         {
            param1["loginTree"]["extraScratchMc"].gotoAndStop("normal");
            param1["loginTree"]["extraScratchMc"]["extraTxt"].text = this.langArr[20];
            Central.main.initButton(param1["loginTree"]["extraScratchMc"]["extraScratchBtn"],this.getMoreToken,ButtonData.GETNOW);
         }
      }
      
      private function configureEmblemBonus(extra:MovieClip) : void
      {
         var bonus:MovieClip = extra ? extra["extraScratchBtn"] : null;
         if(bonus == null)
         {
            return;
         }
         bonus.gotoAndStop(1);
         bonus.stop();
         bonus.mouseChildren = false;
         bonus.mouseEnabled = false;
         var label:TextField = bonus["txt"] as TextField;
         if(label)
         {
            label.embedFonts = false;
            label.defaultTextFormat = new TextFormat("_sans",14,16777215,true,null,null,null,null,"center");
            label.text = "Bonus Active";
            label.setTextFormat(label.defaultTextFormat);
            label.selectable = false;
            label.mouseEnabled = false;
         }
      }

      public function showSuperPrize(param1:String) : void
      {
         var _loc2_:Array = null;
         var _loc3_:String = null;
         var _loc4_:String = null;
         var _loc5_:MovieClip = null;
         var _loc6_:String = null;
         var _loc7_:MovieClip = null;
         var _loc8_:MovieClip = null;
         var _loc9_:* = 0;
         var _loc10_:uint = 1;
         var _loc11_:Object = null;
         if(AppData.type == AppData.RR)
         {
            _loc9_ = 0;
            _loc10_ = this.specialGrandPrizeRR.length;
         }
         while(_loc9_ != _loc10_)
         {
            if(this.specialGrand)
            {
               if(AppData.type == AppData.RR)
               {
                  _loc2_ = this.specialGrandPrizeRR[_loc9_].split("_");
                  _loc3_ = _loc2_[0];
                  _loc4_ = _loc2_[1];
               }
               else if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
               {
                  _loc2_ = this.specialGrandPrize[0].split("_");
                  _loc3_ = _loc2_[0];
                  _loc4_ = _loc2_[1];
               }
               else
               {
                  _loc2_ = this.specialGrandPrize[1].split("_");
                  _loc3_ = _loc2_[0];
                  _loc4_ = _loc2_[1];
               }
            }
            else
            {
               _loc2_ = this.superPrize.split("_");
               _loc3_ = _loc2_[0];
               _loc4_ = _loc2_[1];
            }
            _loc5_ = new LoadingMc();
            switch(param1)
            {
               case "idlePost":
                  if(_loc10_ > 1)
                  {
                     _loc7_ = this["PanelMc"]["scratchPanel"]["idlePost"]["bigToken"]["reward_" + _loc9_];
                     _loc8_ = this["PanelMc"]["scratchPanel"]["idlePost"]["bigToken"];
                  }
                  else
                  {
                     _loc7_ = this["PanelMc"]["scratchPanel"]["idlePost"]["bigToken"]["reward"];
                     _loc8_ = this["PanelMc"]["scratchPanel"]["idlePost"]["bigToken"];
                  }
                  break;
               case "rewardList":
                  if(_loc10_ > 1)
                  {
                     _loc7_ = this["PanelMc"]["scratchPanel"]["rewardListPost"]["reward_" + _loc9_];
                     _loc8_ = this["PanelMc"]["scratchPanel"]["rewardListPost"];
                  }
                  else
                  {
                     _loc7_ = this["PanelMc"]["scratchPanel"]["rewardListPost"]["reward"];
                     _loc8_ = this["PanelMc"]["scratchPanel"]["rewardListPost"];
                  }
            }
            if(_loc3_ != "SKILL")
            {
               _loc7_.gotoAndStop("item");
            }
            else
            {
               _loc7_.gotoAndStop("skill");
            }
            _loc8_["btnHelp"].visible = false;
            switch(_loc3_)
            {
               case "GOLD":
                  _loc5_ = Central.main.getLib("GoldIcon");
                  _loc5_["txt"].text = _loc4_;
                  _loc6_ = _loc4_ + " " + this.langArr[12];
                  break;
               case "TOKEN":
                  _loc5_ = Central.main.getLib("TokenIcon");
                  _loc5_["txt"].text = _loc4_;
                  _loc6_ = _loc4_ + " " + this.langArr[6];
                  break;
               case "XP%":
                  _loc5_ = Central.main.getLib("XPIcon");
                  _loc5_["txt"].text = _loc4_ + "%";
                  _loc6_ = _loc4_ + "% XP";
                  break;
               case "XP":
                  _loc5_ = Central.main.getLib("XPIcon");
                  _loc5_["txt"].text = _loc4_;
                  _loc6_ = _loc4_ + " XP";
                  break;
               case "TP":
                  _loc5_ = Central.main.getLib("TPIcon");
                  _loc5_["txt"].text = _loc4_;
                  _loc6_ = _loc4_ + " TP";
                  break;
               case "WEAPON":
                  Item.getWeaponIcon("wpn" + _loc4_,_loc5_);
                  _loc6_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_WEAPON,"wpn" + _loc4_);
                  break;
               case "SKILL":
                  _loc5_ = Central.main.getLib("skill_" + _loc4_);
                  _loc6_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_SKILL,"skill" + _loc4_);
                  break;
               case "ITEM":
                  _loc11_ = Central.main.toolkit.getDisplayData(String("item" + _loc4_));
                  _loc5_ = _loc11_.mc;
                  _loc6_ = _loc11_.tooltip;
                  break;
               case "BACK":
                  Item.getBackItemIcon("back" + _loc4_,_loc5_);
                  _loc6_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_BACKITEM,"back" + _loc4_);
                  break;
               case "CLOTH":
                  Item.getClothIcon("set" + _loc4_,_loc5_);
                  _loc6_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_CLOTHING,"set" + _loc4_);
                  break;
               case "EMBLEM":
                  _loc5_ = Central.main.getLib("emblemIcon");
                  _loc6_ = this.langArr[39];
                  break;
               case "PET":
                  _loc11_ = Central.main.toolkit.getDisplayData(String("pet" + _loc4_));
                  _loc5_ = _loc11_.mc;
                  _loc6_ = _loc11_.tooltip;
                  break;
               case "PACKAGE":
                  _loc8_["btnHelp"].visible = true;
                  _loc8_["btnHelp"].addEventListener(MouseEvent.CLICK,this.showPackageReward);
                  _loc5_ = Central.main.getLib(this.package_icon);
                  _loc6_ = this.langArr[43];
            }
            GF.removeAllChild(_loc7_["rewardIcon"]["iconHolder"]);
            _loc7_["rewardIcon"]["iconHolder"].addChild(_loc5_);
            Central.main.showDynamicTooltip(_loc7_,String("<font size=\'16\'>" + _loc6_ + "</font>"));
            _loc9_++;
         }
      }
      
      private function showPackageReward(param1:MouseEvent) : void
      {
         var _loc2_:MovieClip = this["PanelMc"]["helpMc"];
         _loc2_.gotoAndPlay(Timeline.SHOW);
      }
      
      public function onshowPackageReward(param1:MovieClip) : void
      {
         param1 = param1["panel"];
         param1["btnClose"].addEventListener(MouseEvent.CLICK,this.hideshowPackageReward);
         param1["titleTxt"].text = this.langArr[44];
         var _loc2_:int = 0;
         while(_loc2_ < 3)
         {
            GF.removeAllChild(param1["reward" + (_loc2_ + 1)]["rewardIcon"]["iconHolder"]);
            _loc2_++;
         }
         var _loc3_:MovieClip = new MovieClip();
         Item.getHairIcon(this.package_hair,_loc3_);
         param1["reward1"]["rewardIcon"]["iconHolder"].addChild(_loc3_);
         Central.main.showDynamicTooltip(param1["reward1"],String("<font size=\'16\'>" + String(TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_HAIR,this.package_hair)) + "</font>"));
         var _loc4_:MovieClip = new MovieClip();
         Item.getClothIcon(this.package_clothing,_loc4_);
         param1["reward2"]["rewardIcon"]["iconHolder"].addChild(_loc4_);
         Central.main.showDynamicTooltip(param1["reward2"],String("<font size=\'16\'>" + String(TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_CLOTHING,this.package_clothing)) + "</font>"));
         var _loc5_:MovieClip = new MovieClip();
         Item.getBackItemIcon(this.package_backitem,_loc5_);
         param1["reward3"]["rewardIcon"]["iconHolder"].addChild(_loc5_);
         Central.main.showDynamicTooltip(param1["reward3"],String("<font size=\'16\'>" + String(TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_BACKITEM,this.package_backitem)) + "</font>"));
      }
      
      private function hideshowPackageReward(param1:MouseEvent = null) : void
      {
         var _loc2_:MovieClip = this["PanelMc"]["helpMc"];
         _loc2_.gotoAndPlay("exit");
      }
      
      public function onshowPopUpFreeCard(param1:MovieClip) : void
      {
         param1.stop();
         Central.main.initButton(this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["ShareBtn"],this.getFreeCard,ButtonData.CONFIRM);
         if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
         {
            this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["emblemMc"]["extraScratchBtn"].visible = false;
         }
         else
         {
            Central.main.initButton(this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["emblemMc"]["extraScratchBtn"],this.getMoreToken,ButtonData.GETMORE);
         }
         this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["remainCard"].gotoAndStop("left_" + this.loginDay);
         this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["lbl_draw_title"].text = this.langArr[23];
         this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["remainScratch_Txt"].text = this.langArr[24];
         this["PanelMc"]["popupFreeCard"]["popUpPanelMc"]["emblemMc"]["extraTxt"].text = this.langArr[25];
      }
      
      public function getFreeCard(param1:MouseEvent) : void
      {
         this["PanelMc"]["popupFreeCard"].gotoAndPlay("exit");
      }
      
      public function startCardFly(param1:MovieClip) : void
      {
         if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
         {
            switch(int(this.haveScratchTime))
            {
               case 2:
                  this["PanelMc"]["popupFreeCard"]["FlyCard"].gotoAndPlay("fourCard");
                  break;
               case 3:
                  this["PanelMc"]["popupFreeCard"]["FlyCard"].gotoAndPlay("fiveCard");
                  break;
               case 4:
                  this["PanelMc"]["popupFreeCard"]["FlyCard"].gotoAndPlay("sixCard");
            }
         }
         else
         {
            switch(this.haveScratchTime)
            {
               case 1:
                  this["PanelMc"]["popupFreeCard"]["FlyCard"].gotoAndPlay("oneCard");
                  break;
               case 2:
                  this["PanelMc"]["popupFreeCard"]["FlyCard"].gotoAndPlay("twoCard");
                  break;
               case 3:
                  this["PanelMc"]["popupFreeCard"]["FlyCard"].gotoAndPlay("threeCard");
            }
         }
      }
      
      public function FinishCardFly(param1:MovieClip) : void
      {
         this["PanelMc"]["remainMc"].visible = true;
         this["PanelMc"]["remainMc"].gotoAndStop("left_" + this.haveScratchTime);
         this.updatePanel();
      }
      
      private function updateTokenMenu() : void
      {
         this["PanelMc"]["tokenTxt"].text = String(Account.getAccountBalance());
      }
      
      public function updatePanel() : void
      {
         var _loc2_:int = 0;
         var _loc1_:MovieClip = this["PanelMc"];
         if(!_loc1_["closeBtn"].hasEventListener(MouseEvent.CLICK))
         {
            _loc1_["closeBtn"].addEventListener(MouseEvent.CLICK,this.hide);
         }
         this.updateTokenMenu();
         this.remainScratchTime = Central.main.dailyRoulette_remainTime;
         this.remainSpcScratchTime = Central.main.dailyRoulette_spc_remainTime;
         _loc1_["remainMc"]["remainScratch_Txt"].text = this.langArr[4].replace("[num]",this.remainScratchTime + this.remainSpcScratchTime);
         if(this.remainScratchTime < this.haveScratchTime)
         {
            _loc2_ = 0;
            while(_loc2_ < this.haveScratchTime)
            {
               if(_loc2_ + 1 > this.remainScratchTime)
               {
                  _loc1_["remainMc"]["scratch" + (_loc2_ + 1)].filters = [this.dimFilter];
               }
               _loc2_++;
            }
         }
         _loc1_["remainMc"]["spcScratchNum"].text = "X" + this.remainSpcScratchTime;
         if(this.remainSpcScratchTime == 0)
         {
            _loc1_["remainMc"]["scratch"].filters = [this.dimFilter];
         }
         else
         {
            _loc1_["remainMc"]["scratch"].filters = null;
         }
         if(AppData.type != AppData.RR)
         {
            _loc1_["remainMc"]["spcScratchNum"].visible = false;
            _loc1_["remainMc"]["scratch"].visible = false;
            _loc1_["remainMc"]["plusIcon"].visible = false;
            _loc1_["remainMc"]["displayTxt"].visible = false;
         }
         if(this.firstTimeGrand == true)
         {
            if(this.remainScratchTime == this.haveScratchTime - 1)
            {
               this.canWallFeed = true;
            }
         }
         Central.main.updateMenu();
         if(this.isLevelUp == true)
         {
            Central.main.showLevelUp(this.showlvreward);
            this.isLevelUp = false;
         }
      }
      
      public function showlvreward() : void
      {
         Central.main.getMainChar().checkLvUpReward();
      }
      
      public function resetBtnDisplay() : void
      {
         GF.removeAllChild(this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder1"]);
         GF.removeAllChild(this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder2"]);
         GF.removeAllChild(this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder3"]);
         this["PanelMc"]["scratchPanel"]["idlePost"]["scratch1"].visible = true;
         this["PanelMc"]["scratchPanel"]["idlePost"]["scratch2"].visible = true;
         this["PanelMc"]["scratchPanel"]["idlePost"]["scratch3"].visible = true;
         GF.removeAllChild(this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["iconHolder"]);
      }
      
      public function updateIdlePanel() : void
      {
         var _loc1_:MovieClip = this["PanelMc"];
         var _loc2_:MovieClip = _loc1_["scratchPanel"]["idlePost"];
         this.showSuperPrize("idlePost");
         _loc2_["bigToken"]["grandPrizeTxt"].text = this.langArr[19];
         _loc2_["bigToken"]["dateTxt"].text = this.langArr[28];
         _loc1_["closeBtn"].visible = true;
         Central.main.initButton(_loc2_["prizeListBtn"],this.showRewardList);
         _loc2_["prizeListBtn"]["txt"].text = this.langArr[3];
         Central.main.disableButton(_loc2_["scratch1"]["scratchBtn"],this.gotoApplicationPage);
         Central.main.disableButton(_loc2_["scratch2"]["scratchBtn"],this.gotoApplicationPage);
         Central.main.disableButton(_loc2_["scratch3"]["scratchBtn"],this.gotoApplicationPage);
         if(Central.main.getMainChar().isFan)
         {
            if(this.remainScratchTime != 0 || this.remainSpcScratchTime != 0)
            {
               this.scratchType = "free";
               _loc2_["scratch1"].gotoAndStop("button");
               _loc2_["scratch2"].gotoAndStop("button");
               _loc2_["scratch3"].gotoAndStop("button");
               Central.main.initButton(_loc2_["scratch1"]["scratchBtn"],this.checkScratch);
               Central.main.initButton(_loc2_["scratch2"]["scratchBtn"],this.checkScratch);
               Central.main.initButton(_loc2_["scratch3"]["scratchBtn"],this.checkScratch);
               _loc2_["scratch1"]["scratchBtn"]["txtFree"].text = this.langArr[22];
               _loc2_["scratch2"]["scratchBtn"]["txtFree"].text = this.langArr[22];
               _loc2_["scratch3"]["scratchBtn"]["txtFree"].text = this.langArr[22];
            }
            else
            {
               this.scratchType = "token";
               _loc2_["scratch1"].gotoAndStop("button_token");
               _loc2_["scratch2"].gotoAndStop("button_token");
               _loc2_["scratch3"].gotoAndStop("button_token");
               Central.main.initButton(_loc2_["scratch1"]["scratchBtn"],this.checkScratch);
               Central.main.initButton(_loc2_["scratch2"]["scratchBtn"],this.checkScratch);
               Central.main.initButton(_loc2_["scratch3"]["scratchBtn"],this.checkScratch);
               _loc2_["scratch1"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
               _loc2_["scratch2"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
               _loc2_["scratch3"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            }
            if(_loc2_["btnHelp"])
            {
               _loc2_["btnHelp"].visible = false;
            }
         }
         else
         {
            if(AppData.type != AppData.RR)
            {
               if(_loc2_["btnHelp"])
               {
                  _loc2_["btnHelp"].visible = true;
                  _loc2_["btnHelp"].addEventListener(MouseEvent.CLICK,this.gotoHelpLike);
               }
            }
            else if(_loc2_["btnHelp"])
            {
               _loc2_["btnHelp"].visible = false;
            }
            this.notFans();
         }
         if(this.scratchType == "free")
         {
            _loc2_["lbl_loginnotice"].text = this.langArr[1];
         }
         else
         {
            _loc2_["lbl_loginnotice"].text = this.langArr[2];
         }
      }
      
      public function disableBtn() : void
      {
         var _loc1_:MovieClip = this["PanelMc"];
         var _loc2_:MovieClip = _loc1_["scratchPanel"]["idlePost"];
         var _loc3_:MovieClip = new fakeBall();
         var _loc4_:MovieClip = new fakeBall();
         _loc1_["closeBtn"].visible = false;
         Central.main.disableButton(_loc2_["scratch1"]["scratchBtn"],this.checkScratch);
         Central.main.disableButton(_loc2_["scratch2"]["scratchBtn"],this.checkScratch);
         Central.main.disableButton(_loc2_["scratch3"]["scratchBtn"],this.checkScratch);
         Central.main.disableButton(_loc2_["prizeListBtn"],this.showRewardList);
         switch(this.selectScratch)
         {
            case 1:
               this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder2"].addChild(_loc3_);
               this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder3"].addChild(_loc4_);
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch2"].visible = false;
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch3"].visible = false;
               break;
            case 2:
               this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder1"].addChild(_loc3_);
               this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder3"].addChild(_loc4_);
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch1"].visible = false;
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch3"].visible = false;
               break;
            case 3:
               this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder1"].addChild(_loc3_);
               this["PanelMc"]["scratchPanel"]["idlePost"]["fakeIconHolder2"].addChild(_loc4_);
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch1"].visible = false;
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch2"].visible = false;
         }
      }
      
      public function showRewardList(param1:MouseEvent) : void
      {
         Central.main.disableButton(this["PanelMc"]["scratchPanel"]["idlePost"]["prizeListBtn"],this.showRewardList);
         this["PanelMc"]["scratchPanel"].gotoAndPlay("flip");
      }
      
      public function onRewardList(param1:MovieClip) : void
      {
         param1.stop();
         this["PanelMc"]["closeBtn"].visible = true;
         Central.main.initButton(this["PanelMc"]["scratchPanel"]["rewardListPost"]["scatchNowBtn"],this.flipBack);
      }
      
      public function flipBack(param1:MouseEvent) : void
      {
         Central.main.disableButton(this["PanelMc"]["scratchPanel"]["rewardListPost"]["scatchNowBtn"],this.flipBack);
         this["PanelMc"]["scratchPanel"].gotoAndPlay("flipBack");
      }
      
      public function onStandBy(param1:MovieClip) : void
      {
         param1.stop();
         if(AppData.type == AppData.RR)
         {
            param1["idlePost"].gotoAndStop("rr_promote");
         }
         else
         {
            param1["idlePost"]["worldHistoryBtn"].visible = false;
         }
         this.updateIdlePanel();
      }
      
      public function checkScratch(param1:MouseEvent) : void
      {
         this["PanelMc"]["scratchPanel"]["idlePost"]["youcantsee"].visible = true;
         switch(param1.currentTarget.parent.name)
         {
            case "scratch1":
               this.selectScratch = 1;
               break;
            case "scratch2":
               this.selectScratch = 2;
               break;
            case "scratch3":
               this.selectScratch = 3;
         }
         this.startScratchAmf();
      }
      
      public function gotoShop(param1:MouseEvent = null) : void
      {
         Central.panel.getInstance().show("shop_new","xmas");
      }
      
      public function startScratchAmf() : void
      {
         if(this.scratchType == "token")
         {
            if(Account.getAccountBalance() < this.scratchTokenPrice)
            {
               Central.main.getGoldToken(Central.main.langLib.get(1405),Central.main.gotoPaymentGateway,"token");
               return;
            }
         }
         if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
         {
            if(Central.main.getMainChar().getInventory(InventoryData.TYPE_ITEM).length + 1 > Data.INV_SPACE_PREMIUM)
            {
            }
            if(Central.main.getMainChar().getInventory(InventoryData.TYPE_MATERIAL).length + 1 > Data.INV_SPACE_MATERIAL_PREMIUM)
            {
            }
         }
         else
         {
            if(Central.main.getMainChar().getInventory(InventoryData.TYPE_ITEM).length + 1 > Data.INV_SPACE_FREE)
            {
            }
            if(Central.main.getMainChar().getInventory(InventoryData.TYPE_MATERIAL).length + 1 > Data.INV_SPACE_MATERIAL_FREE)
            {
            }
         }
         if(Central.main.getMainChar().getInventory(InventoryData.TYPE_ESSENCE).length + 1 > Data.INV_SPACE_ESSENCE)
         {
         }
         if(Central.main.getMainChar().getInventory(InventoryData.TYPE_WEAPON).length + 1 >= Data.INV_SPACE_WEAPON)
         {
         }
         if(Central.main.getMainChar().getInventory(InventoryData.TYPE_BODY_SET).length + 1 >= Data.INV_SPACE_BODYSET)
         {
         }
         if(Central.main.getMainChar().getInventory(InventoryData.TYPE_BACK_ITEM).length + 1 >= Data.INV_SPACE_BACKITEM)
         {
         }
         this.disableBtn();
         this.startCallAmf();
      }
      
      public function startCallAmf(param1:MouseEvent = null) : void
      {
         var _loc2_:String = Central.main.getHash(this.scratchType);
         this.disableBtn();
         if(this.scratchType == "token")
         {
            Account.balance = Account.getAccountBalance() - this.scratchTokenPrice;
         }
         this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["scratchBtn"].gotoAndStop(3);
         this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"].visible = false;
         Central.main.updateMenu();
         this.updateTokenMenu();
         Central.main.amfClient.service("RouletteService.scratchCard",[this.session_key,this.scratchType,this.selectScratch,_loc2_],this.ScratchAmfGetResult);
      }
      
      public function ScratchAmfGetResult(param1:Object) : void
      {
         var hash:String = null;
         var response:Object = param1;
         this.dailyScratchTrack();
         try
         {
            if(Central.main.getMainChar().getLevel() == 1 || Central.main.getMainChar().getLevel() == 2)
            {
               Central.main.tracking.generalTrack(String("Lv" + Central.main.getMainChar().getLevel() + "_dropout"),"Scratch_" + this.scratchType);
            }
         }
         catch(err:Error)
         {
            Out.error(this,"TRACKING :: LV1 TRACK >> " + err.message);
         }
         if(Central.main.validateAmfResponse(response))
         {
            hash = String(response.reward_type) + String(response.reward_amount);
            if(response.signature != Central.main.getHash(String(hash)))
            {
               Out.error(this,"ScratchAmfGetResult :: error");
               Central.main.onError("1216","");
               return;
            }
            if(this.scratchType == "token")
            {
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch].gotoAndPlay("select_token");
            }
            else
            {
               this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch].gotoAndPlay("select");
            }
            this.startScratch(response);
         }
      }
      
      public function startScratch(param1:Object) : void
      {
         var _loc2_:String = null;
         var _loc3_:MovieClip = null;
         var _loc5_:* = undefined;
         var _loc6_:uint = 0;
         var _loc7_:Array = null;
         var _loc8_:Object = null;
         var _loc9_:* = undefined;
         var _loc4_:Object = null;
         _loc3_ = new LoadingMc();
         switch(param1.reward_type)
         {
            case "GOLD":
               _loc3_ = Central.main.getLib("GoldIcon");
               _loc3_["txt"].text = param1.reward_amount;
               _loc2_ = param1.reward_amount + " " + this.langArr[12];
               Central.main.getMainChar().updateGold(0 + param1.reward_amount);
               break;
            case "XP%":
               _loc3_ = Central.main.getLib("XPIcon");
               _loc3_["txt"].text = param1.reward_amount + "%";
               _loc2_ = param1.reward_amount + "% XP";
               _loc6_ = uint(param1.reward_amount);
               _loc5_ = Formula.getXpByLv(Central.main.getMainChar().getLevel() + 1) - Formula.getXpByLv(Central.main.getMainChar().getLevel());
               _loc5_ = Math.round(_loc5_ * _loc6_ / 100);
               this.isLevelUp = Central.main.getMainChar().updateXP(_loc5_);
               break;
            case "XP":
               _loc3_ = Central.main.getLib("XPIcon");
               _loc3_["txt"].text = param1.reward_amount;
               _loc2_ = param1.reward_amount + " XP";
               _loc5_ = param1.reward_amount;
               this.isLevelUp = Central.main.getMainChar().updateXP(_loc5_);
               break;
            case "TOKEN":
               _loc3_ = Central.main.getLib("TokenIcon");
               _loc3_["txt"].text = param1.reward_amount;
               _loc2_ = param1.reward_amount + " " + this.langArr[6];
               Account.balance = Account.getAccountBalance() + param1.reward_amount;
               break;
            case "TP":
               _loc3_ = Central.main.getLib("TPIcon");
               _loc3_["txt"].text = param1.reward_amount;
               _loc2_ = param1.reward_amount + " TP";
               Central.main.getMainChar().updateData(DBCharacterData.BLOODLINE,int(param1.reward_amount) + int(Central.main.getMainChar().getData(DBCharacterData.BLOODLINE)));
               break;
            case "ITEM":
               _loc4_ = Central.main.toolkit.getDisplayData(String("item" + param1.reward_amount));
               this.iiconData = _loc4_;
               _loc3_ = _loc4_.mc;
               if(param1.reward_amount == 1144)
               {
                  _loc3_ = new redstone();
               }
               else if(param1.reward_amount == 1145)
               {
                  _loc3_ = new greenstone();
               }
               else if(param1.reward_amount == 1146)
               {
                  _loc3_ = new bluestone();
               }
               else if(param1.reward_amount == 1147)
               {
                  _loc3_ = new pupstone();
               }
               else if(param1.reward_amount == 1148)
               {
                  _loc3_ = new yellowstone();
               }
               else if(param1.reward_amount == 1150)
               {
                  _loc3_ = new greenbulestone();
               }
               _loc2_ = _loc4_.tooltip;
               Central.main.toolkit.DisplayDataAddInventory(_loc4_);
               break;
            case "WEAPON":
               Item.getWeaponIcon("wpn" + param1.reward_amount,_loc3_);
               _loc2_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_WEAPON,"wpn" + param1.reward_amount);
               Central.main.getMainChar().addInventory(InventoryData.TYPE_WEAPON,"wpn" + param1.reward_amount);
               break;
            case "BACK":
               Item.getBackItemIcon("back" + param1.reward_amount,_loc3_);
               _loc2_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_BACKITEM,"back" + param1.reward_amount);
               Central.main.getMainChar().addInventory(InventoryData.TYPE_BACK_ITEM,"back" + param1.reward_amount);
               break;
            case "SKILL":
               _loc3_ = Central.main.getLib("skill_" + param1.reward_amount);
               _loc2_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_SKILL,"skill" + param1.reward_amount);
               if(this.skillBase != "")
               {
                  if(Central.main.getMainChar().hasSkill(this.skillBase))
                  {
                     Central.main.getMainChar().removeEquippedSkill(this.skillBase);
                     Central.main.getMainChar().removeInventory(InventoryData.TYPE_SKILL,this.skillBase);
                  }
               }
               Central.main.getMainChar().addInventory(InventoryData.TYPE_SKILL,"skill" + param1.reward_amount);
               break;
            case "CLOTH":
               Item.getClothIcon("set" + param1.reward_amount,_loc3_);
               _loc2_ = TooltipData.getItemTooltip(TooltipData.TOOLTIP_TYPE_CLOTHING,"set" + param1.reward_amount);
               Central.main.getMainChar().addInventory(InventoryData.TYPE_BODY_SET,"set" + param1.reward_amount);
               break;
            case "EMBLEM":
               _loc3_ = Central.main.getLib("emblemIcon");
               _loc2_ = this.langArr[39];
               break;
            case "PET":
               _loc4_ = Central.main.toolkit.getDisplayData(String("pet" + param1.reward_amount));
               _loc3_ = _loc4_.mc;
               _loc2_ = _loc4_.tooltip;
               _loc7_ = [];
               if(param1.pet_data)
               {
                  this.petObject = param1.pet_data as Object;
               }
               _loc8_ = this.petObject;
               if(_loc8_)
               {
                  if(_loc8_.equipped)
                  {
                     _loc9_ = Central.main.dataParser.parsePetData(_loc8_);
                     Central.main.getMainChar().initStandbyPet(_loc9_,_loc8_.swfName,_loc8_.clsName);
                     _loc7_ = [];
                     _loc7_.push("swf/pets/" + _loc8_.swfName + ".swf");
                     Central.main.enableMenu();
                     this.pet_id = _loc8_.id;
                  }
               }
               if(_loc7_)
               {
                  Central.main.loadSwf(_loc7_,this.loadPetFinish,null,Central.main.langLib.get(102));
               }
               else
               {
                  this.loadPetFinish();
               }
               break;
            case "PACKAGE":
               _loc3_ = Central.main.getLib(this.package_icon);
               _loc2_ = this.langArr[43];
               Central.main.getMainChar().addInventory(InventoryData.TYPE_HAIR,this.package_hair);
               Central.main.getMainChar().addInventory(InventoryData.TYPE_BODY_SET,this.package_clothing);
               Central.main.getMainChar().addInventory(InventoryData.TYPE_BACK_ITEM,this.package_backitem);
         }
         this.showRewardIcon = _loc3_;
         this.showRewardAmount = param1.reward_amount;
         this.showRewardTooltip = _loc2_;
         this.showRewardType = param1.reward_type;
         if(param1.reward_type == "SKILL")
         {
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"].visible = true;
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"]["iconHolder"].addChild(_loc3_);
         }
         else
         {
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"].visible = false;
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["iconHolder"].addChild(_loc3_);
         }
         Central.main.updateMenu();
         this.updateTokenMenu();
         --Central.main.currScartchCard;
         if(Central.main.currScartchCard <= 0)
         {
            Central.main.currScartchCard = 0;
         }
         Central.main.updateMapSideBtn();
      }
      
      private function loadPetFinish(param1:Object = null) : void
      {
         var _loc2_:Array = null;
         var _loc3_:int = 0;
         if(param1)
         {
            _loc2_ = Central.main.getMainChar().pets;
            _loc3_ = 0;
            while(_loc3_ < _loc2_.length)
            {
               if(_loc2_[_loc3_].getPetId() == this.pet_id)
               {
               }
               _loc3_++;
            }
         }
         Central.main.updateMenu();
         Central.main.hideAmfLoading();
      }
      
      public function onFinishScratch() : void
      {
         this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch].stop();
         this["PanelMc"]["popupReward"].gotoAndPlay("show");
         this["PanelMc"]["scratchPanel"]["idlePost"]["youcantsee"].visible = false;
      }
      
      public function notFans() : void
      {
         var _loc1_:MovieClip = this["PanelMc"];
         var _loc2_:MovieClip = _loc1_["scratchPanel"]["idlePost"];
         _loc2_["likeMc"].gotoAndStop("show");
         _loc2_["likeMc"].addEventListener(MouseEvent.CLICK,this.gotoApplicationPage);
         _loc2_["likeMc"].buttonMode = true;
         _loc2_["likeMc"]["lbl_loginnotice"].text = this.langArr[18];
         _loc2_["bigToken"]["grandPrizeTxt"].text = this.langArr[19];
         _loc2_["bigToken"]["dateTxt"].text = this.langArr[28];
         if(this.remainScratchTime != 0 || this.remainSpcScratchTime != 0)
         {
            this.scratchType = "free";
            _loc2_["scratch1"].gotoAndStop("button");
            _loc2_["scratch2"].gotoAndStop("button");
            _loc2_["scratch3"].gotoAndStop("button");
            Central.main.initButton(_loc2_["scratch1"]["scratchBtn"],this.gotoApplicationPage);
            Central.main.initButton(_loc2_["scratch2"]["scratchBtn"],this.gotoApplicationPage);
            Central.main.initButton(_loc2_["scratch3"]["scratchBtn"],this.gotoApplicationPage);
            _loc2_["scratch1"]["scratchBtn"]["txtFree"].text = this.langArr[22];
            _loc2_["scratch2"]["scratchBtn"]["txtFree"].text = this.langArr[22];
            _loc2_["scratch3"]["scratchBtn"]["txtFree"].text = this.langArr[22];
         }
         else
         {
            this.scratchType = "token";
            _loc2_["scratch1"].gotoAndStop("button_token");
            _loc2_["scratch2"].gotoAndStop("button_token");
            _loc2_["scratch3"].gotoAndStop("button_token");
            Central.main.initButton(_loc2_["scratch1"]["scratchBtn"],this.gotoApplicationPage);
            Central.main.initButton(_loc2_["scratch2"]["scratchBtn"],this.gotoApplicationPage);
            Central.main.initButton(_loc2_["scratch3"]["scratchBtn"],this.gotoApplicationPage);
            _loc2_["scratch1"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            _loc2_["scratch2"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            _loc2_["scratch3"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
         }
      }
      
      public function onshowPopUpReward(param1:MovieClip) : void
      {
         var _loc2_:MovieClip = null;
         var _loc4_:String = null;
         var _loc5_:String = null;
         var _loc6_:Array = null;
         var _loc7_:String = null;
         var _loc8_:String = null;
         var _loc9_:String = null;
         var _loc10_:String = null;
         param1.stop();
         var _loc3_:MovieClip = param1["popUpPanelMc"];
         _loc2_ = new LoadingMc();
         _loc2_ = this.showRewardIcon;
         _loc5_ = this.showRewardAmount;
         _loc4_ = this.showRewardTooltip;
         _loc3_["lbl_draw_title"].text = this.langArr[17];
         switch(this.showRewardType)
         {
            case "GOLD":
            case "TP":
            case "TOKEN":
               _loc3_["skillIconMC"].visible = false;
               _loc3_["rewardIcon"].visible = true;
               _loc3_["rewardIcon"]["iconHolder"].addChild(_loc2_);
               _loc2_["txt"].text = _loc5_;
               break;
            case "XP%":
               _loc3_["skillIconMC"].visible = false;
               _loc3_["rewardIcon"].visible = true;
               _loc3_["rewardIcon"]["iconHolder"].addChild(_loc2_);
               _loc2_["txt"].text = Number(_loc5_) + "%";
               break;
            case "XP":
               _loc3_["skillIconMC"].visible = false;
               _loc3_["rewardIcon"].visible = true;
               _loc3_["rewardIcon"]["iconHolder"].addChild(_loc2_);
               _loc2_["txt"].text = Number(_loc5_);
               break;
            case "WEAPON":
            case "BACK":
            case "CLOTH":
            case "ITEM":
               _loc2_ = this.iiconData.mc;
               _loc3_["skillIconMC"].visible = false;
               _loc3_["rewardIcon"].visible = true;
               _loc3_["rewardIcon"]["iconHolder"].addChild(_loc2_);
               break;
            case "PET":
            case "PACKAGE":
               _loc3_["skillIconMC"].visible = false;
               _loc3_["rewardIcon"].visible = true;
               _loc3_["rewardIcon"]["iconHolder"].addChild(_loc2_);
               break;
            case "SKILL":
               _loc3_["skillIconMC"].visible = true;
               _loc3_["rewardIcon"].visible = false;
               _loc2_ = Central.main.getLib("skill_" + this.showRewardAmount);
               _loc3_["skillIconMC"]["iconHolder"].addChild(_loc2_);
               break;
            case "EMBLEM":
               _loc3_["skillIconMC"].visible = false;
               _loc3_["rewardIcon"].visible = true;
               _loc3_["rewardIcon"]["iconHolder"].addChild(_loc2_);
         }
         if(this.showRewardType == "SKILL")
         {
            Central.main.showDynamicTooltip(_loc3_["skillIconMC"],String("<font size=\'16\'>" + _loc4_ + "</font>"));
         }
         else
         {
            Central.main.showDynamicTooltip(_loc3_["rewardIcon"],String("<font size=\'16\'>" + _loc4_ + "</font>"));
         }
         if(this.showRewardType == "TOKEN")
         {
            Central.main.tracking.generalTrack(Central.main.tracking.TRACK_TOKEN_SOURCE,_loc5_,Central.main.tracking.TRACK_DAILY_TOKEN_SOURCES,"","",_loc5_);
         }
         if(this.specialGrand)
         {
            if(this.showRewardType == "EMBLEM")
            {
               if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
               {
                  _loc6_ = this.specialGrandPrize[0].split("_");
                  _loc7_ = _loc6_[0];
                  _loc8_ = _loc6_[1];
                  Central.main.initButton(_loc3_["ShareBtn"],this.onClickShare,ButtonData.CONFIRM);
               }
               else
               {
                  _loc6_ = this.specialGrandPrize[1].split("_");
                  _loc7_ = _loc6_[0];
                  _loc8_ = _loc6_[1];
                  Central.main.initButton(_loc3_["ShareBtn"],this.showEmblemPopup,ButtonData.CONFIRM);
               }
            }
            else
            {
               _loc6_ = this.specialGrandPrize[0].split("_");
               _loc7_ = _loc6_[0];
               _loc8_ = _loc6_[1];
               Central.main.initButton(_loc3_["ShareBtn"],this.onClickShare,ButtonData.CONFIRM);
            }
         }
         else
         {
            _loc6_ = this.superPrize.split("_");
            _loc7_ = _loc6_[0];
            _loc8_ = _loc6_[1];
            Central.main.initButton(_loc3_["ShareBtn"],this.onClickShare,ButtonData.CONFIRM);
         }
         if(this.showRewardType == _loc7_ && _loc5_ == _loc8_)
         {
            if(AppData.type != AppData.RR)
            {
               Central.sns.publishFeedById(SNSData.FEED_1,this.langArr[26],this.langArr[27],"wf_96");
            }
            else
            {
               Central.sns.publishShareFeed("dailyscratch",this.langArr[26],this.langArr[27],"wf_96");
            }
            if(this.canWallFeed == true && this.firstTimeGrand == false)
            {
               this.firstTimeGrand = true;
               this.canWallFeed = false;
            }
         }
         if(this.canWallFeed == true && AppData.type != AppData.RR)
         {
            this.firstTimeGrand = false;
            Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,"Day" + this.loginDay,Central.main.tracking.TRACK_FREE_STAGE_FIRST_CLAIM);
            _loc9_ = this.session_key + "4" + "" + 1 + _loc5_.toString();
            _loc10_ = Central.main.updateSequence();
            Central.main.amfClient.service("FriendReward.getFriendReward",[this.session_key,"4","",1,_loc5_.toString(),Central.main.getHash(String(_loc9_)),_loc10_],this.respondFriendReward);
         }
      }
      
      public function showEmblemPopup(param1:MouseEvent) : void
      {
         Central.main.showRefreshConfirmation(this.langArr[40],this.langArr[41],this.onClickRefresh,ButtonData.RELOAD);
      }
      
      public function dailyScratchTrack() : void
      {
         var _loc1_:int = int(Central.main.getMainChar().getLevel());
         if(this.scratchType == "free")
         {
            Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,"Free",Central.main.tracking.TRACK_TOTAL_SCRATCH);
            switch(_loc1_)
            {
               case 60:
                  if(this.charRank < 6)
                  {
                     Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
                  }
                  else
                  {
                     Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_NOT_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
                  }
                  break;
               case 40:
                  if(this.charRank == 2 || this.charRank == 3)
                  {
                     Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
                  }
                  else
                  {
                     Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_NOT_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
                  }
                  break;
               case 20:
                  if(this.charRank == 1)
                  {
                     Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
                  }
                  else
                  {
                     Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_NOT_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
                  }
                  break;
               default:
                  Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,Central.main.tracking.TRACK_NOT_LEVEL_CAP,Central.main.tracking.TRACK_FREE_SCRATCH);
            }
         }
         if(this.scratchType == "token")
         {
            Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,"Token",Central.main.tracking.TRACK_TOTAL_SCRATCH);
            if(Central.main.account.getAccountType() == Central.main.account.PREMIUM)
            {
               Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,_loc1_,Central.main.tracking.TRACK_SALE_PREMIUM);
            }
            else
            {
               Central.main.tracking.generalTrack(Central.main.tracking.TRACK_DAILY_LOGIN_SCRATCH,_loc1_,Central.main.tracking.TRACK_SALE_FREE);
            }
         }
      }
      
      public function startFlip(param1:MovieClip) : void
      {
         var _loc2_:MovieClip = this["PanelMc"];
         var _loc3_:MovieClip = _loc2_["scratchPanel"]["idlePost"];
         _loc2_["closeBtn"].visible = false;
         if(this.scratchType == "free")
         {
            _loc3_["lbl_loginnotice"].text = this.langArr[1];
         }
         else
         {
            _loc3_["lbl_loginnotice"].text = this.langArr[2];
         }
         _loc3_["prizeListBtn"]["txt"].text = this.langArr[3];
      }
      
      public function onInitRewardListFB(param1:MovieClip) : void
      {
         param1["lbl_loginnotice2"].text = this.langArr[3];
         param1["grandPrizeTxt"].text = this.langArr[19];
         param1["dateTxt"].text = this.langArr[28];
         param1["scatchNowBtn"]["txt"].text = this.langArr[5];
         param1["tokenTxt"].text = this.langArr[6];
         param1["skillTxt"].text = this.langArr[7];
         param1["weaponTxt"].text = this.langArr[8];
         param1["backTxt"].text = this.langArr[9];
         param1["tpTxt"].text = this.langArr[10];
         param1["xpTxt"].text = this.langArr[11];
         param1["goldTxt"].text = this.langArr[12];
         param1["itemTxt"].text = this.langArr[13];
         this.showSuperPrize("rewardList");
      }
      
      public function onInitRewardListRR(param1:MovieClip) : void
      {
         param1["lbl_loginnotice2"].text = this.langArr[3];
         param1["grandPrizeTxt"].text = this.langArr[19];
         param1["dateTxt"].text = this.langArr[28];
         param1["scatchNowBtn"]["txt"].text = this.langArr[5];
         param1["tokenTxt"].text = this.langArr[6];
         param1["weaponTxt"].text = this.langArr[8];
         param1["backTxt"].text = this.langArr[9];
         param1["xpTxt"].text = this.langArr[11];
         param1["goldTxt"].text = this.langArr[12];
         param1["itemTxt"].text = this.langArr[13];
         this.showSuperPrize("rewardList");
      }
      
      public function onflip(param1:MovieClip) : void
      {
         if(AppData.type == AppData.RR)
         {
            param1["rewardListPost"].gotoAndStop("rr_promote");
         }
         else
         {
            this["PanelMc"]["scratchPanel"]["rewardListPost"]["worldHistoryBtn"].visible = false;
         }
      }
      
      public function startFlipBack(param1:MovieClip) : void
      {
         if(AppData.type == AppData.RR)
         {
            param1["rewardListPost"].gotoAndStop("rr_promote");
         }
         else
         {
            param1["rewardListPost"]["worldHistoryBtn"].visible = false;
         }
         this["PanelMc"]["closeBtn"].visible = false;
      }
      
      public function onflipBack(param1:MovieClip) : void
      {
         if(AppData.type == AppData.RR)
         {
            param1["idlePost"].gotoAndStop("rr_promote");
         }
         else
         {
            param1["idlePost"]["worldHistoryBtn"].visible = false;
         }
         var _loc2_:MovieClip = this["PanelMc"];
         var _loc3_:MovieClip = _loc2_["scratchPanel"]["idlePost"];
         this.showSuperPrize("idlePost");
         _loc3_["bigToken"]["grandPrizeTxt"].text = this.langArr[19];
         _loc3_["bigToken"]["dateTxt"].text = this.langArr[28];
         if(this.scratchType == "free")
         {
            _loc3_["lbl_loginnotice"].text = this.langArr[1];
         }
         else
         {
            _loc3_["lbl_loginnotice"].text = this.langArr[2];
         }
         _loc3_["prizeListBtn"]["txt"].text = this.langArr[3];
         if(!Central.main.getMainChar().isFan)
         {
            _loc3_["likeMc"].gotoAndStop("show");
            _loc3_["likeMc"]["lbl_loginnotice"].text = this.langArr[18];
         }
         if(this.remainScratchTime != 0 || this.remainSpcScratchTime != 0)
         {
            this.scratchType = "free";
            _loc3_["scratch1"].gotoAndStop("button");
            _loc3_["scratch2"].gotoAndStop("button");
            _loc3_["scratch3"].gotoAndStop("button");
            Central.main.disableButton(_loc3_["scratch1"]["scratchBtn"],this.checkScratch);
            Central.main.disableButton(_loc3_["scratch2"]["scratchBtn"],this.checkScratch);
            Central.main.disableButton(_loc3_["scratch3"]["scratchBtn"],this.checkScratch);
         }
         else
         {
            this.scratchType = "token";
            _loc3_["scratch1"].gotoAndStop("button_token");
            _loc3_["scratch2"].gotoAndStop("button_token");
            _loc3_["scratch3"].gotoAndStop("button_token");
            Central.main.disableButton(_loc3_["scratch1"]["scratchBtn"],this.checkScratch);
            Central.main.disableButton(_loc3_["scratch2"]["scratchBtn"],this.checkScratch);
            Central.main.disableButton(_loc3_["scratch3"]["scratchBtn"],this.checkScratch);
            _loc3_["scratch1"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            _loc3_["scratch2"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            _loc3_["scratch3"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
         }
      }
      
      public function onClickShare(param1:MouseEvent) : void
      {
         this.popUpHide();
      }
      
      public function getExtraScratch(param1:MouseEvent) : void
      {
      }
      
      public function showSelect(param1:MovieClip) : void
      {
      }
      
      public function getMoreToken(param1:MouseEvent) : void
      {
         Central.main.gotoPaymentGateway();
      }
      
      public function popUpHide() : void
      {
         if(this.remainScratchTime != 0)
         {
            --Central.main.dailyRoulette_remainTime;
         }
         else if(this.remainSpcScratchTime != 0)
         {
            --Central.main.dailyRoulette_spc_remainTime;
         }
         this.updatePanel();
         this["PanelMc"]["popupReward"].gotoAndPlay(Timeline.EXIT);
         this["PanelMc"]["scratchPanel"].gotoAndPlay("next");
      }
      
      public function startNext(param1:MovieClip) : void
      {
         var _loc2_:MovieClip = null;
         if(AppData.type == AppData.RR)
         {
            this["PanelMc"]["scratchPanel"]["idlePost"].gotoAndStop("rr_promote");
         }
         _loc2_ = this.showRewardIcon;
         if(this.showRewardType == "SKILL")
         {
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"].visible = true;
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"]["iconHolder"].addChild(_loc2_);
         }
         else
         {
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["skillIconHolder"].visible = false;
            this["PanelMc"]["scratchPanel"]["idlePost"]["scratch" + this.selectScratch]["iconHolder"].addChild(_loc2_);
         }
         switch(this.showRewardType)
         {
            case "GOLD":
               _loc2_["txt"].text = this.showRewardAmount;
               break;
            case "XP%":
               _loc2_["txt"].text = Number(this.showRewardAmount) + "%";
               break;
            case "XP":
               _loc2_["txt"].text = this.showRewardAmount;
               break;
            case "TOKEN":
               _loc2_["txt"].text = this.showRewardAmount;
               break;
            case "TP":
               _loc2_["txt"].text = this.showRewardAmount;
         }
      }
      
      public function resetScratch() : void
      {
         this.resetBtnDisplay();
         var _loc1_:MovieClip = this["PanelMc"];
         var _loc2_:MovieClip = _loc1_["scratchPanel"]["idlePost"];
         if(AppData.type == AppData.RR)
         {
            _loc2_.gotoAndStop("rr_promote");
         }
         _loc2_["bigToken"]["grandPrizeTxt"].text = this.langArr[19];
         _loc2_["bigToken"]["dateTxt"].text = this.langArr[28];
         if(this.remainScratchTime != 0 || this.remainSpcScratchTime != 0)
         {
            this.scratchType = "free";
            _loc2_["scratch1"].gotoAndStop("button");
            _loc2_["scratch2"].gotoAndStop("button");
            _loc2_["scratch3"].gotoAndStop("button");
            Central.main.initButton(_loc2_["scratch1"]["scratchBtn"],this.checkScratch);
            Central.main.initButton(_loc2_["scratch2"]["scratchBtn"],this.checkScratch);
            Central.main.initButton(_loc2_["scratch3"]["scratchBtn"],this.checkScratch);
         }
         else
         {
            this.scratchType = "token";
            _loc2_["scratch1"].gotoAndStop("button_token");
            _loc2_["scratch2"].gotoAndStop("button_token");
            _loc2_["scratch3"].gotoAndStop("button_token");
            Central.main.initButton(_loc2_["scratch1"]["scratchBtn"],this.checkScratch);
            Central.main.initButton(_loc2_["scratch2"]["scratchBtn"],this.checkScratch);
            Central.main.initButton(_loc2_["scratch3"]["scratchBtn"],this.checkScratch);
            _loc2_["scratch1"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            _loc2_["scratch2"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
            _loc2_["scratch3"]["scratchBtn"]["tokenTxt"].text = this.scratchTokenPrice;
         }
         this.showRewardAmount = "";
         this.showRewardIcon = null;
         this.showRewardTooltip = "";
         this.showRewardType = "";
      }
      
      public function hide(param1:MouseEvent) : void
      {
         var evt:MouseEvent = param1;
         try
         {
            if(Central.main.getMainChar().getLevel() == 1 || Central.main.getMainChar().getLevel() == 2)
            {
               Central.main.tracking.generalTrack(String("Lv" + Central.main.getMainChar().getLevel() + "_dropout"),"Close_ScratchCard");
            }
         }
         catch(err:Error)
         {
            Out.error(this,"TRACKING :: LV1 TRACK >> " + err.message);
         }
         Central.main.updateMenu();
         this.gotoAndPlay(Timeline.EXIT);
         Central.main.removeEventPopupPanel();
         Central.main.proc.streamStartEvents();
      }
      
      public function checkWallFeedOK() : void
      {
      }
      
      private function respondFriendReward(param1:Object) : void
      {
         var _loc2_:Object = null;
         var _loc3_:String = null;
         if(Central.main.validateAmfResponse(param1))
         {
            this.canWallFeed = false;
            _loc2_ = param1;
            _loc3_ = Central.main.getHash(String(String(_loc2_.status) + String(_loc2_.reward_type) + String(_loc2_.reward_amount) + String(_loc2_.reward_id) + String(_loc2_.wallfeed_id)));
            if(int(_loc2_.status) > 0)
            {
               if(_loc3_ == _loc2_.hash_str)
               {
                  switch(_loc2_.reward_id)
                  {
                     case "1180":
                        Central.sns.publishShareFeed(SNSData.FEED_FR_LUCKY_DRAW_XP,_loc2_.wallfeed_id,_loc2_.reward_amount);
                        break;
                     case "1190":
                        Central.sns.publishShareFeed(SNSData.FEED_FR_LUCKY_DRAW_GOLD,_loc2_.wallfeed_id,_loc2_.reward_amount);
                        break;
                     case "1200":
                        Central.sns.publishShareFeed(SNSData.FEED_FR_LUCKY_DRAW_TOKEN,_loc2_.wallfeed_id,_loc2_.reward_amount);
                  }
               }
               else
               {
                  Central.main.onError("120","");
               }
            }
         }
      }
      
      private function gotoApplicationPage(param1:MouseEvent = null) : void
      {
         this["PanelMc"]["scratchPanel"]["idlePost"]["youcantsee"].visible = true;
         this["PanelMc"]["maskMc"].gotoAndPlay(Timeline.SHOW);
         Central.main.callJS("openFanBox");
      }
      
      public function onPopupMask() : void
      {
         this["PanelMc"]["maskMc"]["closeBtn"].visible = true;
         this["PanelMc"]["maskMc"]["closeBtn"].addEventListener(MouseEvent.CLICK,this.hidePopupMask);
      }
      
      private function hidePopupMask(param1:MouseEvent = null) : void
      {
         Central.main.callJS("closeFanBox");
         this["PanelMc"]["maskMc"].gotoAndStop(Timeline.IDLE);
         Central.main.showAmfLoading();
         Central.main.amfClient.service("CharacterService.checkFacebookFan",[this.session_key,AppData.lang],this.isFanResponse);
      }
      
      private function isFanResponse(param1:Object) : *
      {
         Central.main.hideAmfLoading();
         if(Central.main.validateAmfResponse(param1))
         {
            Central.main.getMainChar().isFan = param1.result.is_fan;
            if(Central.main.getMainChar().isFan)
            {
               if(this.remainScratchTime == this.haveScratchTime)
               {
                  this.canWallFeed = true;
               }
               this["PanelMc"]["scratchPanel"]["idlePost"]["likeMc"].gotoAndStop(Timeline.IDLE);
               this["PanelMc"]["scratchPanel"]["idlePost"]["btnHelp"].visible = false;
               this["PanelMc"]["scratchPanel"]["idlePost"]["btnHelp"].removeEventListener(MouseEvent.CLICK,this.gotoHelpLike);
               this.updateIdlePanel();
            }
         }
      }
      
      private function onClickRefresh(param1:MouseEvent = null) : void
      {
         switch(AppData.type)
         {
            case AppData.FB:
               switch(AppData.lang)
               {
                  case AppData.ZH:
                     Central.main.gotoURL("http://apps.facebook.com/ninjasaga_zh/");
                     break;
                  case AppData.ES:
                     Central.main.gotoURL("http://apps.facebook.com/ninjasaga_es/");
                     break;
                  default:
                     Central.main.gotoURL("http://apps.facebook.com/ninjasaga/");
               }
               break;
            case AppData.RR:
               Central.main.gotoURL("http://apps.renren.com/ninjasaga/");
               break;
            case AppData.YM:
               Central.main.gotoURL("http://tw.socialgame.yahoo.net/userapp/userapp.php?appid=622");
               break;
            default:
               Central.main.gotoURL("http://www.ninjasaga.com");
         }
      }
      
      private function gotoHelpLike(param1:MouseEvent) : void
      {
         switch(AppData.type)
         {
            case AppData.FB:
               switch(AppData.lang)
               {
                  case AppData.ZH:
                     Central.main.gotoURL("http://www.ninjasaga.com/game-info/scratch_cards_problem.php?lang=zh","_blank");
                     break;
                  default:
                     Central.main.gotoURL("http://www.ninjasaga.com/game-info/scratch_cards_problem.php?lang=en","_blank");
               }
         }
      }
      
      internal function frame1() : *
      {
         this.stop();
      }
      
      internal function frame10() : *
      {
         this.onShow();
      }
      
      internal function frame20() : *
      {
         this.gotoAndStop("idle");
      }
   }
}

