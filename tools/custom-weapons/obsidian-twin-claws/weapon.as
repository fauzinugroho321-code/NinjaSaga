package {
    import flash.display.DisplayObject;
    import flash.display.DisplayObjectContainer;
    import flash.display.MovieClip;
    import flash.events.Event;
    import flash.geom.Matrix;

    // The rear blade is rendered in the rear hand slot for body occlusion.
    // Removing this weapon reclaims that blade and removes its frame listener.
    public dynamic class weapon extends MovieClip {
        public var leftBlade:MovieClip;
        public var rightBlade:MovieClip;
        private var characterHost:MovieClip;
        // Reference silhouette: each blade is about 1.7 character heights long.
        private static const BLADE_SCALE:Number = 0.23;

        public function weapon() {
            super();
            stop();
            mouseEnabled = false;
            mouseChildren = false;
            addEventListener(Event.ADDED_TO_STAGE, onAdded, false, 0, true);
            addEventListener(Event.REMOVED_FROM_STAGE, onRemoved, false, 0, true);
        }

        private function onAdded(event:Event):void {
            if (event.target != this) return;
            characterHost = null;
            updateBlades(null);
            addEventListener(Event.EXIT_FRAME, updateBlades, false, 0, true);
        }

        private function onRemoved(event:Event):void {
            if (event.target != this) return;
            removeEventListener(Event.EXIT_FRAME, updateBlades);
            if (rightBlade != null && rightBlade.parent != this) addChild(rightBlade);
            characterHost = null;
        }

        private function findCharacter():MovieClip {
            var candidate:DisplayObjectContainer = parent;
            var depth:int = 0;
            while (candidate != null && depth < 8) {
                if (candidate is MovieClip && "left_hand" in candidate && "right_hand" in candidate) {
                    return candidate as MovieClip;
                }
                candidate = candidate.parent;
                depth++;
            }
            return null;
        }

        private function followHand(blade:MovieClip, hand:DisplayObject, mirror:Boolean):void {
            if (blade == null) return;
            if (hand == null || !hand.visible) {
                blade.visible = false;
                return;
            }
            var ownerMatrix:Matrix = blade.parent.transform.concatenatedMatrix;
            if (Math.abs(ownerMatrix.a * ownerMatrix.d - ownerMatrix.b * ownerMatrix.c) < 0.00001) {
                blade.visible = false;
                return;
            }
            ownerMatrix.invert();
            // Source pixels -> hand coordinates; the wrist is the pivot.
            // Native ActionBase faces left; Battle mirrors it for the player.
            // Both sprites keep their top/bottom orientation. Calibrate the
            // differently rotated wrists so both tips face forward/down in idle.
            var angle:Number = (mirror ? -47.316 : -20.583) * Math.PI / 180;
            var cosine:Number = Math.cos(angle) * BLADE_SCALE;
            var sine:Number = Math.sin(angle) * BLADE_SCALE;
            var m:Matrix = new Matrix(-cosine, -sine, -sine, cosine, 0, 0);
            m.tx = -850 * m.a - 440 * m.c;
            m.ty = 8 - 850 * m.b - 440 * m.d;
            m.concat(hand.transform.concatenatedMatrix);
            m.concat(ownerMatrix);
            blade.transform.matrix = m;
            blade.alpha = blade.parent == hand ? 1 : hand.alpha;
            blade.visible = true;
        }

        private function updateBlades(event:Event):void {
            if (leftBlade == null || rightBlade == null) return;
            if (characterHost == null || !characterHost.contains(this)) characterHost = findCharacter();
            if (characterHost != null) {
                var rearHand:MovieClip = characterHost["right_hand"] as MovieClip;
                if (rearHand != null && rightBlade.parent != rearHand) rearHand.addChild(rightBlade);
                rightBlade.mouseEnabled = false;
                rightBlade.mouseChildren = false;
                followHand(leftBlade, characterHost["left_hand"] as DisplayObject, false);
                followHand(rightBlade, characterHost["right_hand"] as DisplayObject, true);
                return;
            }
            if (rightBlade.parent != this) addChild(rightBlade);
            // Standalone Gear model preview, where no body/hand slots exist.
            leftBlade.visible = rightBlade.visible = true;
            leftBlade.alpha = rightBlade.alpha = 1;
            leftBlade.transform.matrix = new Matrix(0.065, 0, 0, 0.065, -57.65, -64);
            rightBlade.transform.matrix = new Matrix(0.065, 0, 0, 0.065, -57.65, -7);
        }
    }
}
