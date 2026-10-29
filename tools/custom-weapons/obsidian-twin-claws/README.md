# Obsidian Twin Claws — local custom weapon

A pair of black and bronze hand claws adapted from the user-approved mockup.
One inventory item equips two independent blade instances, one per hand.

- Inventory ID: `wpn9000` (stored as `9000` in the weapon bag)
- Asset: `web/cdn/swf/latest/swf/items/wpn_9000.swf`
- Requirement: Level 20; base damage: 180; premium: no
- Attack animation: existing `attack_10`; no added status effects
- Gear → Weapons → **Obsidian Twin Claws** → Equip

The first installation grants and equips the item on Kuroko (character 4).
His previous weapon stays available in the weapon inventory. Progress, money,
skills, other equipment and other characters are preserved.

## Design and lifecycle

`weapon.as` runs only inside the custom weapon SWF. It draws both blade children
relative to the character's actual `left_hand` and `right_hand` matrices after
the animation frame has been constructed (`EXIT_FRAME`). The inverse weapon
container transform cancels the original single-weapon timeline's motion.
The front blade stays inside the weapon object. While equipped, the rear blade
is a child of the rear hand slot so the torso and front arm occlude it. On
`REMOVED_FROM_STAGE`, the weapon reclaims its rear blade and removes its frame
listener, so replacing equipment removes both graphics.

When no character parent exists, the Gear model preview displays the pair side
by side vertically. The `icon` symbol is static and displays both blades.
The transparent sprite is embedded in the SWF; there are no external image loads.

The catalog patch edits only `DataLibraryEN.getWeapon` bytecode to append a new
entry. It preserves all existing weapon data and all other method bytecode.
It does not recompile `Main`, `code_library`, `menu` or `action_base`.

The bundled action library lacked `gotoWin_TypeAttack10`, although the game
invokes it after winning with a gauntlet weapon. `repair-attack10-win.py` adds
that method name as an alias to the existing `gotoWin` body. All pre-existing
method bytecode and visual/timeline payloads remain unchanged. The original
action library is included in the dated backup. Rebuild this small compatibility
patch separately with:

```sh
python3 tools/custom-weapons/obsidian-twin-claws/repair-attack10-win.py \
  backups/obsidian-twin-claws-20261028/web/cdn/swf/latest/swf/actions/action_base.swf \
  /private/tmp/action-base-with-claw-victory.swf tools/ffdec/ffdec.jar
```

## Rebuild

Requires Python 3, Java and the repository's FFDec. From the repository root:

```sh
python3 tools/custom-weapons/obsidian-twin-claws/build-custom-weapon.py \
  "$PWD" tools/custom-weapons/obsidian-twin-claws/weapon.png \
  /private/tmp/ninja-claws-rebuild
```

The builder expects an unmodified `DataLibraryEN.getWeapon` getter and refuses to
add an already-used ID. To rebuild after installation, use a temporary repository
layout with the original `data_library_en.swf` from the dated backup, or rebuild
only `build_asset` when changing the art/attachment code. Never overwrite an
unrelated newer catalog with an older backup.

The builder round-trips the catalog through FFDec and verifies only its getter
changed, with additive string/multiname constants. Rebuild output must be reviewed
before copying `wpn_9000.swf` and `data_library_en.swf` into their installed paths.

## Grant again / another character

Stop the Node game server first so its in-memory character cache cannot overwrite
the save. Then:

```sh
node tools/custom-weapons/obsidian-twin-claws/grant-custom-weapon.cjs 4 --equip
```

Omit `--equip` to add it only to the inventory. Repeat grants do not create
duplicates. Restart the server and open a fresh game session afterwards.

## Validation

- `node --test tests/custom-weapon.test.cjs`: idempotent grant, inventory-only
  grant, preservation of prior equipment, progress and unrelated characters.
- Standalone Ruffle harness: catalog lookup, both hand instances, transformed
  wrists, equipment removal/listener cleanup, and re-equipping.
- Pose harness: real action timeline display lists with game callbacks disabled
  only in the temporary test copy; checks all 25 `attack_10` pose frames.
- Victory harness: real `ActionBase` attack hit/finish callbacks fire once,
  the new victory alias completes, and it matches the standard victory pose.
- Real gameplay: user confirmed both weapons visible, Attack, Mission Success
  and return to village working after the victory fix on 2026-10-28. A fresh
  session loaded the patched action library without AVM2 errors in the inspected
  log. Saved Kuroko equipment was verified as `wpn9000` afterwards.
  The live battle confirmation was provided by the user, not UI automation.

`runtime-preview.png` is rendered by Ruffle from game assets; it is not an AI
mockup. Harness sources are included for reference. Backup manifest records the
exact installed hashes and protected core SWFs.

## Art provenance

`mockup.png` is the approved concept. `weapon.png` is its transparent extraction
produced with the built-in imagegen tool. The same sprite is instanced on each
hand with mirrored attachment transforms. See `image-prompt.txt` for the prompt.

## Reference size adjustment (2026-10-28)

Equipped blade scale is 0.23 source pixels per hand unit (3.54 times the initial
0.065 scale). The measured blade length is 1.745 character heights in the battle
idle test pose, matching the approximate 1.7–1.9 ratio in the supplied references.
The source pivot (850,440) remains at hand-local (0,8); the blade extends forward
across the body in idle. Inventory icons and standalone panel previews keep their
existing fit. Both wrists, transformed hands, unequip cleanup and all 25 attack
pose frames passed the Ruffle harness.

## Player-facing orientation correction (2026-10-28)

The native ActionBase rig faces left and Battle mirrors it for the player. Both
blades now reflect their source X axis and retain their source Y orientation.
Per-wrist calibration (-20.583 degrees left / -47.316 degrees right) makes both
blade tips point forward and 15 degrees down in battle idle. Source pivot and
scale 0.23 are preserved. The mirrored-player harness checks forward/down
direction for both blades, their wrist attachment, transformed wrists, cleanup,
re-equipping and all 25 attack frames. All passed.

## Rear-hand depth correction (2026-10-28)

The right/rear blade now renders inside `ActionBase.right_hand`, whose timeline
depth is behind the torso. Its matrix uses the inverse of its actual parent,
keeping the source wrist pivot and approved scale/orientation. The blade inherits
rear-hand opacity once and cannot intercept mouse input. Cleanup tests cover
unequipping and removing/re-adding the entire character. Both pass alongside
forward-facing direction, both wrists and all 25 attack pose frames.
