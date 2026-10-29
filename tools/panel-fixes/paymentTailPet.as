package ninjasaga.linkage
{
   import com.utils.CreateFilter;
   import com.utils.Out;
   import com.utils.GF;
   import flash.display.MovieClip;
   import flash.events.MouseEvent;
   import flash.filters.ColorMatrixFilter;
   import flash.filters.GlowFilter;
   import flash.system.Capabilities;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.geom.Rectangle;
   import ninjasaga.Account;
   import ninjasaga.Central;
   import ninjasaga.Item;
   import ninjasaga.data.AMFData;
   import ninjasaga.data.AppData;
   import ninjasaga.data.ButtonData;
   import ninjasaga.data.SNSData;
   import ninjasaga.data.Timeline;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol745")]
   public class paymentTailPet extends MovieClip
   {
      
      public var panelMC:MovieClip;
      
      private var dimFilter:ColorMatrixFilter = CreateFilter.getSaturationFilter(0);
      
      private var shadowFilter:ColorMatrixFilter = new ColorMatrixFilter([0,0,0,0,31,0,0,0,0,31,0,0,0,0,31,0,0,0,1,0]);
      
      private var outlineFilter:GlowFilter = new GlowFilter(16747520,0.65,6,6,2,1,false,false);
      
      private var remainingPet:int = 0;
      
      private var pet_id:int;
      
      private var langArr:Array = [];
      
      private var paymentPanellangArr:Array = [];
      
      private var selectItem:String = "";
      
      private var PetItem:Object;
      
      private var tailPetArr:Array = [];
      
      private var tailSwfArr:Array = [];
      
      private var tailBtnArr:Array = [];
      
      private var toolTipArr:Array = [];
      
      private var tailPetCanShowArr:Array = [];
      
      private var tailPetOverDateArr:Array = [];
      
      private var ownedTailArr:Array = [];
      
      private var notForSell:Array = [];
      
      private var method_payment:Array = [];
      
      private var method_tokenBuy:Array = [];
      
      private var method_claim:Array = [];
      
      private var defaultPost:int = 0;
      
      private var changeShadow:Array = [];
      
      private var showMcPost:Array = [];
      
      private var pressLimit:int = 0;
      
      private var nowPost:int;
      
      private var LcanPress:int;
      
      private var RcanPress:int;
      
      private var beforePost:int;
      
      private var skillTooltip:int = 0;
      
      private var specialHandle:Array = [];
      
      private var promotionHandle:Array = [];
      
      private var original_price:int = 5000;
      
      private var sale_price1:int = 4500;
      
      private var sale_price2:int = 5000;
      private var pendingTailNumber:int = 0;
      private var purchasePending:Boolean = false;
      private var purchasedPetPath:String = "";
      private var purchasedPetName:String = "";
      
      public function paymentTailPet()
      {
         addFrameScript(0,this.frame1,9,this.frame10,16,this.frame17,27,this.frame28);
         super();
         this.langArr = Central.main.langLib.get(1619);
         this.tailPetArr = [0,146,141,131,86,74,73,71,68,65];
         this.tailSwfArr = ["pet_146","pet_141","pet_131","tail_4_3","tail_5","tail_6","tail_7","snake_0","fox_1"];
         this.tailBtnArr = ["tailx","pet1Btn","pet2Btn","pet3Btn","pet4Btn","pet5Btn","pet6Btn","pet7Btn","pet8Btn","pet9Btn"];
         this.toolTipArr = ["","1","2","3","4","5","6","7","8","9"];
         this.tailPetCanShowArr = [1,2,3,4,5,6,7,8,9];
         this.tailPetOverDateArr = [];
         this.notForSell = [];
         this.method_payment = [];
         this.method_tokenBuy = [1,2,3,4,5,6,7,8,9];
         this.method_claim = [];
         this.defaultPost = 1;
         this.specialHandle = [];
         this.promotionHandle = [];
      }
      
      public function hide(param1:MouseEvent = null) : void
      {
         this.gotoAndPlay(Timeline.EXIT);
         Central.main.updateMenu();
      }
      
      public function onExit() : void
      {
         Central.panel.getInstance().hide(this);
      }
      
      public function show() : void
      {
         this.remainingPet = Central.main.paymentpackage_remain_2;
         Central.main.showAmfLoading();
         Central.main.amfClient.service("Anni5th.getTailPet",[Account.getAccountSessionKey()],this.getCanBuyTailsResponse);
      }
      
      private function getCanBuyTailsResponse(param1:Object) : void
      {
         var _loc2_:int = 0;
         if(Central.main.validateAmfResponse(param1))
         {
            this.method_tokenBuy = [];
            this.ownedTailArr = [];
            this.tailPetOverDateArr = [];
            var active:Array = param1.active_tail_number as Array;
            var owned:Array = param1.owned_tail_number as Array;
            var number:int = 0;
            _loc2_ = 0;
            while(active != null && _loc2_ < active.length)
            {
               number = int(active[_loc2_]);
               if(this.tailPetCanShowArr.indexOf(number) >= 0 && this.method_tokenBuy.indexOf(number) < 0)
               {
                  this.method_tokenBuy.push(number);
               }
               _loc2_++;
            }
            _loc2_ = 0;
            while(owned != null && _loc2_ < owned.length)
            {
               number = int(owned[_loc2_]);
               if(this.tailPetCanShowArr.indexOf(number) >= 0)
               {
                  this.ownedTailArr.push(number);
               }
               _loc2_++;
            }
            _loc2_ = 0;
            while(_loc2_ < this.tailPetCanShowArr.length)
            {
               if(this.method_tokenBuy.indexOf(this.tailPetCanShowArr[_loc2_]) < 0)
               {
                  this.tailPetOverDateArr.push(this.tailPetCanShowArr[_loc2_]);
               }
               _loc2_++;
            }
            this.defaultPost = int(param1.default_tail_number);
            if(this.tailPetCanShowArr.indexOf(this.defaultPost) < 0)
            {
               this.defaultPost = this.method_tokenBuy.length > 0 ? this.method_tokenBuy[0] : this.tailPetCanShowArr[0];
            }
            Central.main.hideAmfLoading();
            if(this.loadTailPetSwf())
            {
               this.gotoAndPlay(Timeline.SHOW);
            }
         }
         else
         {
            Central.main.hideAmfLoading();
            this.gotoAndPlay(Timeline.SHOW);
         }
      }
      
      public function loadTailPetSwf() : Boolean
      {
         var petSwf:String = null;
         var i:int = 0;
         var returnValue:Boolean = false;
         var swfArr:Array = [];
         try
         {
            i = 0;
            while(i < this.tailSwfArr.length)
            {
               if(!Item.hasItem(this.tailSwfArr[i]))
               {
                  swfArr.push("swf/pets/" + this.tailSwfArr[i] + ".swf");
               }
               i++;
            }
            if(swfArr.length > 0)
            {
               Central.main.loadSwf(swfArr,this.loadDisplayPetFinish);
            }
            else
            {
               returnValue = true;
            }
         }
         catch(err:Error)
         {
            Out.error(this,"Can not loadSwf :: " + err.getStackTrace());
         }
         return returnValue;
      }
      
      private function loadDisplayPetFinish(param1:Object) : void
      {
         var item:Item = null;
         var i:int = 0;
         var swfObj:Object = param1;
         try
         {
            i = 0;
            while(i < this.tailSwfArr.length)
            {
               if(!Item.hasItem(this.tailSwfArr[i]))
               {
                  item = new Item(this.tailSwfArr[i]);
                  item.setSwf(swfObj["swf/pets/" + this.tailSwfArr[i] + ".swf"]);
                  Item.setItem(item);
               }
               i++;
            }
         }
         catch(err:Error)
         {
            Out.error(this,"Can not setItem :: " + err.getStackTrace());
         }
         this.gotoAndPlay(Timeline.SHOW);
      }
      
      public function onShow(param1:MovieClip) : void
      {
         param1 = param1["panelMC"];
         if(Capabilities.playerType == "Desktop" || Capabilities.playerType == "Mobile")
         {
            param1.scaleY = 0.7;
         }
         param1["backBtn"].addEventListener(MouseEvent.CLICK,this.hide);
         param1["eventTitle"].text = this.langArr[11];
         param1["dateTxt"].text = "";
         param1["dateTxt"].visible = false;
         this.pressLimit = this.tailPetCanShowArr.length - 1;
         this.showMcPost = [];
         var _loc2_:int = 0;
         while(_loc2_ < this.tailPetCanShowArr.length)
         {
            this.showMcPost.push(_loc2_);
            _loc2_++;
         }
         this.nowPost = Math.max(0,this.tailPetCanShowArr.indexOf(this.defaultPost));
         Central.main.initButton(param1["getMoreBtn"],this.showPaymentGateway,ButtonData.GETMORE);
         this.updateGoldDisplay();
         this.setupLanguage();
         this.checkMcPost("",true);
         this.checkCanPress();
         this.setUpGetMethodBtn();
         this.setTapToolTip();
         if(AppData.type == AppData.RR)
         {
            this.shadowTap();
         }
      }
      
      private function shadeBtn(param1:MovieClip) : void
      {
         try
         {
            param1.gotoAndStop("black");
         }
         catch(err:Error)
         {
            param1.gotoAndStop("unselected");
            param1.filters = [this.shadowFilter,this.outlineFilter];
            param1.buttonMode = false;
            param1.useHandCursor = false;
            param1.mouseEnabled = true;
            param1.mouseChildren = false;
         }
      }
      
      public function shadowTap() : void
      {
         var _loc1_:int = 0;
         while(_loc1_ < this.tailBtnArr.length)
         {
            if(this.tailBtnArr[_loc1_].indexOf("tail") < 0 && this.tailPetCanShowArr.indexOf(_loc1_) < 0)
            {
               this.shadeBtn(this["panelMC"]["petList"][this.tailBtnArr[_loc1_]]);
            }
            _loc1_++;
         }
      }
      
      public function setTapToolTip() : void
      {
         var _loc1_:int = 0;
         while(_loc1_ < this.toolTipArr.length)
         {
            switch(this.toolTipArr[_loc1_])
            {
               case "???":
                  Central.main.showDynamicTooltip(this["panelMC"]["petList"][this.tailBtnArr[_loc1_]],String("<font size=\'16\'>" + Central.main.langLib.get(1648)[0] + "</font>"));
                  break;
               case "coming":
                  Central.main.showDynamicTooltip(this["panelMC"]["petList"][this.tailBtnArr[_loc1_]],String("<font size=\'16\'>" + Central.main.langLib.get(1648)[10] + "</font>"));
                  break;
               case "1":
               case "2":
               case "3":
               case "4":
               case "5":
               case "6":
               case "7":
               case "8":
               case "9":
                  Central.main.showDynamicTooltip(this["panelMC"]["petList"][this.tailBtnArr[_loc1_]],String("<font size=\'16\'>" + Central.main.langLib.get(1648)[_loc1_] + "</font>"));
            }
            _loc1_++;
         }
      }
      
      public function checkCanPress() : void
      {
         var _loc1_:MovieClip = this["panelMC"];
         _loc1_["detailMc"]["nextBtn"].addEventListener(MouseEvent.CLICK,this.clickLRButton);
         _loc1_["detailMc"]["nextBtn"].visible = true;
         _loc1_["detailMc"]["prevBtn"].addEventListener(MouseEvent.CLICK,this.clickLRButton);
         _loc1_["detailMc"]["prevBtn"].visible = true;
         if(this.tailPetCanShowArr.length <= 1)
         {
            _loc1_["detailMc"]["nextBtn"].visible = false;
            _loc1_["detailMc"]["prevBtn"].visible = false;
         }
      }
      
      public function clickLRButton(param1:MouseEvent) : void
      {
         if(this.purchasePending) return;
         switch(param1.currentTarget.name)
         {
            case "prevBtn":
               this.checkMcPost("left");
               break;
            case "nextBtn":
               this.checkMcPost("right");
         }
      }
      
      public function checkMcPost(param1:String = "", param2:Boolean = false) : void
      {
         var _loc3_:MovieClip = this["panelMC"];
         if(this.nowPost < 0 || this.nowPost >= this.tailPetCanShowArr.length)
         {
            this.nowPost = 0;
         }
         this.setupLanguage();
         if(param2)
         {
            _loc3_["detailMc"].gotoAndStop("show");
         }
         else
         {
            switch(param1)
            {
               case "left":
                  --this.nowPost;
                  if(this.nowPost < 0)
                  {
                     this.nowPost = this.tailPetCanShowArr.length - 1;
                  }
                  _loc3_["detailMc"].gotoAndPlay("switchLeft");
                  break;
               case "right":
                  ++this.nowPost;
                  if(this.nowPost == this.tailPetCanShowArr.length)
                  {
                     this.nowPost = 0;
                  }
                  _loc3_["detailMc"].gotoAndPlay("switchRight");
                  break;
               case "click":
                  if(this.nowPost > this.beforePost)
                  {
                     if(this.nowPost == this.tailPetCanShowArr.length - 1 && this.beforePost == 0)
                     {
                        _loc3_["detailMc"].gotoAndPlay("switchLeft");
                     }
                     else
                     {
                        _loc3_["detailMc"].gotoAndPlay("switchRight");
                     }
                  }
                  else if(this.beforePost == this.tailPetCanShowArr.length - 1 && this.nowPost == 0)
                  {
                     _loc3_["detailMc"].gotoAndPlay("switchRight");
                  }
                  else
                  {
                     _loc3_["detailMc"].gotoAndPlay("switchLeft");
                  }
            }
         }
         this.setupLanguage();
         this.updateTab();
      }
      
      public function setupLanguage() : void
      {
         switch(this.tailPetCanShowArr[this.nowPost])
         {
            case 9:
               this.paymentPanellangArr = Central.main.langLib.get(1639);
               this.skillTooltip = 145;
               break;
            case 8:
               this.paymentPanellangArr = Central.main.langLib.get(1640);
               this.skillTooltip = 175;
               break;
            case 7:
               this.paymentPanellangArr = Central.main.langLib.get(1641);
               this.skillTooltip = 191;
               break;
            case 6:
               this.paymentPanellangArr = Central.main.langLib.get(1642);
               this.skillTooltip = 204;
               break;
            case 5:
               this.paymentPanellangArr = Central.main.langLib.get(1643);
               this.skillTooltip = 228;
               break;
            case 4:
               this.paymentPanellangArr = Central.main.langLib.get(1644);
               this.skillTooltip = 244;
               break;
            case 3:
               this.paymentPanellangArr = Central.main.langLib.get(1645);
               break;
            case 2:
               this.paymentPanellangArr = Central.main.langLib.get(1646);
               break;
            case 1:
               this.paymentPanellangArr = Central.main.langLib.get(1647);
               break;
            default:
               this.paymentPanellangArr = Central.main.langLib.get(1619);
               this.skillTooltip = 204;
         }
      }
      
      private function updatePaymentPanel() : void
      {
      }
      
      public function updateDetail() : void
      {
         var petData:Object = null;
         var isSpecial:Boolean = false;
         var item:Item = null;
         var i:int = 0;
         var mc:MovieClip = this["panelMC"]["detailMc"]["panel"];
         this.setupLanguage();
         this.checkCanPress();
         this.setUpGetMethodBtn();
         petData = this.getTailDetail(this.tailPetCanShowArr[this.nowPost]);
         if(petData == null)
         {
            return;
         }
         mc["offerTxt"].text = "";
         mc["petPic"].gotoAndStop(petData.clsName);
         mc["titleTxt"].htmlText = this.paymentPanellangArr[0];
         mc["dateTxt"].htmlText = this.paymentPanellangArr[1];
         mc["cloudMc"].visible = true;
         mc["subTitle"].htmlText = "";
         mc["canClaimTxt"].htmlText = this.paymentPanellangArr[4];
         mc["alertTxt"].htmlText = "";
         if(this.method_payment.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            mc["canClaimNum"].visible = true;
            mc["canClaimNum"].text = this.remainingPet.toString();
         }
         else
         {
            mc["canClaimNum"].visible = false;
         }
         if(this.tailPetOverDateArr.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            mc["dateTxt"].visible = false;
            mc["canClaimTxt"].visible = false;
            mc["claimGain"].visible = false;
            mc["alertTxt"].visible = false;
            mc["descTxt"].visible = false;
            mc["notsaleTxt"].visible = true;
            mc["notsaleTxt"].text = this.paymentPanellangArr[10];
         }
         else
         {
            mc["descTxt"].visible = true;
            mc["dateTxt"].visible = false;
            mc["canClaimTxt"].visible = true;
            mc["claimGain"].visible = true;
            mc["alertTxt"].visible = true;
            mc["claimGain"].visible = true;
            mc["descTxt"].visible = false;
            mc["descTxt"].htmlText = "";
            mc["notsaleTxt"].visible = true;
            mc["notsaleTxt"].text = this.paymentPanellangArr[10];
         }
         if(this.promotionHandle.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            mc["boxBg"].visible = true;
            mc["tail5_bg"].visible = true;
            mc["normal_bg1"].visible = false;
            mc["cloudMc"].visible = false;
            mc["descSPTxt"].visible = true;
            mc["descSPTxt"].text = this.langArr[26];
         }
         else
         {
            mc["boxBg"].visible = false;
            mc["tail5_bg"].visible = false;
            mc["normal_bg1"].visible = true;
            mc["descSPTxt"].visible = false;
         }
         isSpecial = false;
         if(this.method_tokenBuy.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            isSpecial = true;
         }
         if(this.specialHandle.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            if(this.remainingPet <= 0)
            {
               mc["canClaimNum"].visible = false;
               isSpecial = true;
            }
         }
         if(isSpecial)
         {
            mc["dateTxt"].visible = false;
            mc["canClaimTxt"].visible = false;
            mc["claimGain"].visible = false;
            mc["alertTxt"].visible = false;
            mc["descTxt"].visible = false;
            mc["notsaleTxt"].visible = false;
         }
         if(this.ownedTailArr.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            mc["dateTxt"].visible = false;
            mc["canClaimTxt"].visible = false;
            mc["claimGain"].visible = false;
            mc["alertTxt"].visible = false;
            mc["descTxt"].visible = false;
            mc["notsaleTxt"].visible = true;
            mc["notsaleTxt"].text = AppData.lang == AppData.ZH ? "已擁有！" : "Already owned!";
         }
         mc["subTitle"].htmlText = "";
         mc["offerTxt"].text = this.paymentPanellangArr[11];
         item = Item.getItem(petData.swfName);
         for(i = 3; i <= 5; i++)
         {
            var icon:MovieClip = mc["skillIcon_" + i];
            GF.removeAllChild(icon["holder"]);
            Central.main.hideDynamicTooltip(icon);
            var asset:MovieClip = item ? item.getAsset("Skill_" + i) : null;
            icon.visible = asset != null;
            if(asset)
            {
               icon["holder"].addChild(asset);
               var description:String = petData.skill && petData.skill[i] ? String(petData.skill[i].description) : String(Central.main.langLib.petDataTxt(this.skillTooltip + i));
               Central.main.showDynamicTooltip(icon,"<font size='16'>" + description + "</font>");
            }
         }
      }
      
      private function setUpGetMethodBtn() : void
      {
         var _loc1_:MovieClip = this["panelMC"]["detailMc"]["panel"];
         var _loc2_:int = int(this.tailPetCanShowArr[this.nowPost]);
         var _loc3_:Object = this.getTailDetail(this.tailPetCanShowArr[this.nowPost]);
         var oldCaption:TextField = _loc1_.getChildByName("payBtnLocalCaption") as TextField;
         if(oldCaption) oldCaption.visible = false;
         _loc1_["paymentBtn"].visible = false;
         _loc1_["claimBtn"].visible = false;
         _loc1_["payBtn"].visible = false;
         var buttonKeys:Array = ["payBtn","paymentBtn","claimBtn"];
         var buttonIndex:int = 0;
         while(buttonIndex < buttonKeys.length)
         {
            var button:MovieClip = _loc1_[buttonKeys[buttonIndex]];
            button.gotoAndStop(1);
            button.mouseChildren = false;
            buttonIndex++;
         }
         if(_loc3_ == null)
         {
            return;
         }
         if(this.ownedTailArr.indexOf(_loc2_) >= 0)
         {
            _loc1_["payBtn"].visible = false;
            _loc1_["paymentBtn"].visible = false;
            _loc1_["claimBtn"].visible = false;
            return;
         }
         if(this.notForSell.indexOf(_loc2_) >= 0)
         {
            _loc1_["payBtn"].visible = false;
            Central.main.disableButton(_loc1_["payBtn"],this.buyPet,ButtonData.BUY);
            _loc1_["payBtn"].filters = [this.dimFilter];
         }
         if(this.method_tokenBuy.indexOf(_loc2_) >= 0)
         {
            _loc1_["payBtn"].visible = true;
            if(this.tailPetOverDateArr.indexOf(_loc2_) < 0)
            {
               this.initPurchaseButton(_loc1_["payBtn"],this.buyPet,"Buy  " + _loc3_.token);
               _loc1_["payBtn"].filters = null;
            }
            else
            {
               Central.main.disableButton(_loc1_["payBtn"],this.buyPet,String(_loc3_.token));
               _loc1_["payBtn"].filters = [this.dimFilter];
            }
         }
         if(this.method_payment.indexOf(_loc2_) >= 0)
         {
            if(this.remainingPet <= 0)
            {
               _loc1_["paymentBtn"].visible = true;
               if(this.tailPetOverDateArr.indexOf(_loc2_) < 0)
               {
                  Central.main.initButton(_loc1_["paymentBtn"],Central.main.gotoPaymentGateway,ButtonData.GET_NOW2);
                  _loc1_["payBtn"].filters = null;
               }
               else
               {
                  Central.main.disableButton(_loc1_["paymentBtn"],Central.main.gotoPaymentGateway,ButtonData.GET_NOW2);
                  _loc1_["paymentBtn"].filters = [this.dimFilter];
               }
            }
            else
            {
               _loc1_["claimBtn"].visible = true;
               if(this.tailPetOverDateArr.indexOf(_loc2_) < 0)
               {
                  Central.main.initButton(_loc1_["claimBtn"],this.claimPet,ButtonData.CLAIM);
                  _loc1_["payBtn"].filters = null;
               }
               else
               {
                  Central.main.disableButton(_loc1_["claimBtn"],this.claimPet,ButtonData.CLAIM);
                  _loc1_["claimBtn"].filters = [this.dimFilter];
               }
            }
         }
         if(this.specialHandle.indexOf(_loc2_) >= 0)
         {
            if(this.remainingPet <= 0)
            {
               _loc1_["payBtn"].visible = true;
               if(this.tailPetOverDateArr.indexOf(_loc2_) < 0)
               {
                  this.initPurchaseButton(_loc1_["payBtn"],this.buyPet,"Buy  " + _loc3_.token);
                  _loc1_["payBtn"].filters = null;
               }
               else
               {
                  Central.main.disableButton(_loc1_["payBtn"],this.buyPet,String(_loc3_.token));
                  _loc1_["payBtn"].filters = [this.dimFilter];
               }
            }
         }
      }
      
      private function initPurchaseButton(button:MovieClip, handler:Function, caption:String) : void
      {
         Central.main.initButton(button,handler,caption);
         button.mouseChildren = false;
         var container:MovieClip = button.parent as MovieClip;
         var original:TextField = button["txt"] as TextField;
         if(container == null || original == null)
         {
            return;
         }
         var key:String = button.name + "LocalCaption";
         var label:TextField = container.getChildByName(key) as TextField;
         if(label == null)
         {
            label = new TextField();
            label.name = key;
            label.embedFonts = false;
            label.mouseEnabled = false;
            label.selectable = false;
            container.addChild(label);
         }
         var bounds:Rectangle = original.getBounds(container);
         label.x = bounds.x - 15;
         label.y = bounds.y;
         label.width = Math.max(110,bounds.width + 30);
         label.height = Math.max(35,bounds.height + 10);
         label.defaultTextFormat = new TextFormat("_sans",16,65535,true,null,null,null,null,"center");
         label.text = caption;
         label.visible = button.visible;
         original.visible = false;
         container.setChildIndex(label,container.getChildIndex(button) + 1);
      }

      private function updateButton() : void
      {
      }
      
      private function setUpTap() : void
      {
         var _loc1_:MovieClip = this["panelMC"]["petList"];
         var _loc2_:int = 0;
         while(_loc2_ < this.tailBtnArr.length)
         {
            if(this.tailPetCanShowArr.indexOf(_loc2_) >= 0)
            {
               _loc1_[this.tailBtnArr[_loc2_]].buttonMode = true;
               _loc1_[this.tailBtnArr[_loc2_]].useHandCursor = true;
            }
            if(_loc2_ == this.tailPetCanShowArr[this.nowPost])
            {
               _loc1_[this.tailBtnArr[_loc2_]].removeEventListener(MouseEvent.CLICK,this.onClickTap);
            }
            else if(this.tailPetCanShowArr.indexOf(_loc2_) >= 0)
            {
               _loc1_[this.tailBtnArr[_loc2_]].addEventListener(MouseEvent.CLICK,this.onClickTap);
            }
            else if(this.tailBtnArr[_loc2_].indexOf("tail") >= 0)
            {
            }
            _loc2_++;
         }
      }
      
      private function onClickTap(param1:MouseEvent) : void
      {
         if(this.purchasePending) return;
         this.beforePost = this.nowPost;
         this.nowPost = this.tailPetCanShowArr.indexOf(this.tailBtnArr.indexOf(param1.currentTarget.name));
         this.checkMcPost("click");
      }
      
      private function updateTab() : void
      {
         var _loc1_:MovieClip = this["panelMC"]["petList"];
         var _loc2_:int = 0;
         while(_loc2_ < this.tailBtnArr.length)
         {
            if(this.tailBtnArr[_loc2_].indexOf("tail") < 0)
            {
               if(this.tailPetCanShowArr.indexOf(_loc2_) < 0)
               {
                  this.shadeBtn(_loc1_[this.tailBtnArr[_loc2_]]);
               }
               else
               {
                  _loc1_[this.tailBtnArr[_loc2_]].gotoAndStop("unselected");
               }
            }
            _loc2_++;
         }
         _loc1_[this.tailBtnArr[this.tailPetCanShowArr[this.nowPost]]].gotoAndStop("selected");
         this.setUpTap();
      }
      
      private function selectPetResponse(param1:MouseEvent) : void
      {
      }
      
      private function buyPet(param1:MouseEvent) : void
      {
         if(this.purchasePending) return;
         var evt:MouseEvent = param1;
         var petdata:Object = this.getTailDetail(this.tailPetCanShowArr[this.nowPost]);
         if(this.ownedTailArr.indexOf(this.tailPetCanShowArr[this.nowPost]) >= 0)
         {
            Central.main.showOk(AppData.lang == AppData.ZH ? "你已經擁有這隻寵物。" : "You already own this pet.",function():*
            {
            });
            return;
         }
         if(Account.getAccountBalance() < petdata.token)
         {
            Central.main.getGoldToken(Central.main.langLib.get(1405),Central.main.gotoPaymentGateway,"token");
            return;
         }
         trace("checkInventoryByArray>>>" + "pet" + this.tailPetArr[this.tailPetCanShowArr[this.nowPost]]);
         if(!Central.main.toolkit.checkInventoryByArray(["pet" + this.tailPetArr[this.tailPetCanShowArr[this.nowPost]]]))
         {
            Central.main.showOk(AppData.lang == AppData.ZH ? "你的寵物空間不足。" : "Your pet inventory is not enough.",function():*
            {
            });
            return;
         }
         trace("petdata.token >>> " + petdata.token);
         this.pendingTailNumber = int(this.tailPetCanShowArr[this.nowPost]);
         Central.main.showPayTokenConfirm("Buy " + petdata.name + "?",petdata.token,this.confirmBuyPet);
      }
      
      private function confirmBuyPet() : void
      {
         if(this.purchasePending || this.pendingTailNumber == 0) return;
         var _loc1_:Object = this.getTailDetail(this.pendingTailNumber);
         if(_loc1_ == null) return;
         this.purchasePending = true;
         Central.main.showAmfLoading();
         Central.main.amfClient.service("Anni5th.buyPet",[Account.getAccountSessionKey(),String(_loc1_.id),_loc1_.name,AppData.lang],this.onAmfBuyItemResult);
      }
      
      private function onAmfBuyItemResult(response:Object) : void
      {
         if(response == null || int(response.status) != 1 || response.result == null)
         {
            this.purchasePending = false;
            Central.main.hideAmfLoading();
            Central.main.showInfo(response && response.error ? String(response.error) : "Could not buy this pet.");
            return;
         }
         var pet:Object = response.result;
         var databasePet:* = Central.main.dataParser.parsePetData(pet,true);
         if(databasePet == null) return;
         if(!Central.main.getMainChar().hasPet(String(pet.clsName)))
         {
            Central.main.getMainChar().initStandbyPet(databasePet,pet.swfName,pet.clsName);
         }
         if(response.balance != null) Account.balance = Number(response.balance);
         if(this.ownedTailArr.indexOf(this.pendingTailNumber) < 0) this.ownedTailArr.push(this.pendingTailNumber);
         this.pendingTailNumber = 0;
         this.updateDetail();
         this.updateGoldDisplay();
         Central.main.updateMenu();
         this.pet_id = int(pet.id);
         this.purchasedPetName = String(pet.name);
         this.purchasedPetPath = "swf/pets/" + pet.swfName + ".swf";
         Central.main.loadSwf([this.purchasedPetPath],this.loadPurchasedPetFinish);
      }

      private function loadPurchasedPetFinish(loaded:Object) : void
      {
         var pets:Array = Central.main.getMainChar().pets;
         var index:int = 0;
         while(index < pets.length)
         {
            if(pets[index].getPetId() == this.pet_id)
            {
               pets[index].loadedSwf = loaded[this.purchasedPetPath];
               break;
            }
            index++;
         }
         this.purchasePending = false;
         Central.main.hideAmfLoading();
         Central.main.showInfo("Purchased " + this.purchasedPetName + ". Open Pets to equip it.");
      }

      private function loadBuyPetFinish(param1:Object = null) : void
      {
         var _loc2_:Object = this.getTailDetail(this.tailPetCanShowArr[this.nowPost]);
         if(param1)
         {
            Central.main.getMainChar().pet.loadedSwf = param1["swf/pets/" + Central.main.getMainChar().pet.swfName + ".swf"];
         }
         Central.main.showInfo(Central.main.langLib.get(103) + _loc2_.name + "!");
      }
      
      private function claimPet(param1:MouseEvent) : void
      {
         Central.main.showConfirmation(String(this.paymentPanellangArr[6]).replace("[playername]",Central.main.getMainChar().getCharacterName()),this.confirmClaimPet,new Function());
      }
      
      private function confirmClaimPet() : void
      {
         Central.main.showAmfLoading();
         Central.main.amfClient.service("SpecialReward.claimPaymentPet",[Central.main.account.getAccountSessionKey(),AppData.lang],this.claimPetResponse);
      }
      
      private function claimPetResponse(param1:Object) : void
      {
         var _loc2_:Array = null;
         var _loc3_:Object = null;
         var _loc4_:* = undefined;
         Central.main.hideAmfLoading();
         if(Central.main.validateAmfResponse(param1))
         {
            --this.remainingPet;
            --Central.main.paymentpackage_remain_2;
            this.setUpGetMethodBtn();
            this.updateDetail();
            _loc2_ = [];
            _loc3_ = param1.pet_data as Object;
            if(_loc3_)
            {
               if(_loc3_.equipped)
               {
                  _loc4_ = Central.main.dataParser.parsePetData(_loc3_);
                  Central.main.getMainChar().initStandbyPet(_loc4_,_loc3_.swfName,_loc3_.clsName);
                  _loc2_ = [];
                  _loc2_.push("swf/pets/" + this.tailSwfArr[0] + ".swf");
                  Central.main.enableMenu();
                  this.pet_id = _loc3_.id;
               }
            }
            if(_loc2_)
            {
               Central.main.loadSwf(_loc2_,this.loadPetFinish,null,Central.main.langLib.get(102));
            }
            else
            {
               this.loadPetFinish();
            }
            Central.main.showInfo(Central.main.langLib.get(55) + _loc3_.name);
         }
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
                  _loc2_[_loc3_].loadedSwf = param1["swf/pets/" + this.tailSwfArr[0] + ".swf"];
               }
               _loc3_++;
            }
         }
         Central.main.updateMenu();
         Central.main.hideAmfLoading();
      }
      
      private function updateGoldDisplay() : void
      {
         this["panelMC"]["crystalTxt"].text = String(Account.getAccountBalance());
      }
      
      private function showPaymentGateway(param1:MouseEvent) : void
      {
         Central.main.gotoPaymentGateway();
      }
      
      public function getTailDetail(param1:int) : Object
      {
         var _loc2_:Object = null;
         var _loc3_:Object = Central.main.PET_DATA.find("pet" + String(this.tailPetArr[param1]));
         trace("Jane..............this.tailPetArr[tailNum] = " + this.tailPetArr[param1]);
         trace("Jane..............petObj = " + _loc3_);
         if(_loc3_)
         {
            _loc2_ = _loc3_;
         }
         return _loc2_;
      }
      
      internal function frame1() : *
      {
         this.stop();
      }
      
      internal function frame10() : *
      {
         this.onShow(this);
      }
      
      internal function frame17() : *
      {
         this.stop();
      }
      
      internal function frame28() : *
      {
         this.gotoAndStop("idle");
      }
   }
}

