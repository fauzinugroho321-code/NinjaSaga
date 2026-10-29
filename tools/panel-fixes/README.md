# Daily and Halloween panel repairs (28 October 2026)

The AS3 files here replace only their matching linkage class. Do not recompile
Main or any other library: the login/menu and battle fixes must stay intact.

Run from the NinjaSaga repository root, writing into a separate staging folder:

```sh
java -Duser.home=/private/tmp -Xmx1g -jar tools/ffdec/ffdec.jar -onerror abort -replace web/cdn/swf/latest/swf/panels/daily_login_3.swf /private/tmp/daily_login_3.swf ninjasaga.linkage.daily_login3 tools/panel-fixes/daily_login3.as
java -Duser.home=/private/tmp -Xmx1g -jar tools/ffdec/ffdec.jar -onerror abort -replace web/cdn/swf/latest/swf/panels/Halloween_2016.swf /private/tmp/Halloween_2016.swf ninjasaga.linkage.HalloweenEvent2016_trickOrTreat tools/panel-fixes/HalloweenEvent2016_trickOrTreat.as
```

Check the re-exported class and back up the installed panel before replacement.
Original panels, server and installed checksums are in
`backups/daily-event-panels-20261028/manifest.json`.

Daily scratch: clamp the login streak to at least day 1; stop the Emblem bonus
button and show Bonus Active. Initialize after the parent panel is ready. Emblem bonus cards are already in the free total.
Halloween: use stable device-font captions as siblings above the button graphics,
outside the buttons' filtered animation timelines;
apply desktop layout and gender reward adjustments only once per panel.
The monthly calendar is supplied by server/daily-rewards.js and tested in
tests/daily-rewards.test.js. Rewards are a local six-milestone configuration.


## Tailed Beast panel (28 October 2026)

`paymentTailPet.as` replaces only `ninjasaga.linkage.paymentTailPet` in
`web/cdn/swf/latest/swf/panels/popup_tail_pet.swf`.

```sh
java -Duser.home=/private/tmp -Xmx1g -jar tools/ffdec/ffdec.jar -onerror abort -replace web/cdn/swf/latest/swf/panels/popup_tail_pet.swf /private/tmp/popup_tail_pet.swf ninjasaga.linkage.paymentTailPet tools/panel-fixes/paymentTailPet.as
```

The original status response appended 0 even though the client uses
`tailPetCanShowArr.indexOf(defaultTail)`. This selected index -1, so initialization
stopped before setting text, skill icons and purchase button states. The server
now sends tail numbers 1–9 and a separate default_tail_number. The panel also
sanitizes older responses, sets language before rendering details, clears skill
holders before filling them, stops purchase button timelines, and uses stable
caption siblings (the same rendering fix as Halloween).

Purchases now validate the selected tail and account balance, save the pet and
token debit together, and return a signed standby pet immediately. Existing
active pets stay equipped. Duplicate purchases and unsupported payment claims
are rejected. The purchase callback captures the confirmed tail and prevents
another request while a purchase is pending.

Backups/checksums: `backups/tailed-beast-20261028/manifest.json`.
Regression test: `node --test tests/tailed-beast.test.js`.


## Mission Room recruitment and five elements (28 October 2026)

`MissionPanel_2.onRecruitFriend` renders every owned element before attaching the
player graphic, but the original team cards contain only `skillBtn1`–`skillBtn3`.
A five-element character therefore throws TypeError #1010 on `skillBtn4`, leaving
the character holder empty. This is a panel rendering failure; character data
is preserved.

The repaired `mission_2.swf` provides five non-overlapping icons in both the player
and teammate card templates. All five idle/empty/NPC cleanup paths clear slots
1–5 so a previous recruit's icons do not remain after a team change.

Rebuild from the original panel saved in the backup:

```sh
python3 tools/repair-recruit-elements.py backups/recruit-elements-20261028/mission_2.swf /private/tmp/mission_2.swf
```

The repair tool accepts only the recorded original SHA256. It edits the two
card display lists and five one-byte loop bounds, round-trips the result through
FFDec, verifies the layout contract, and confirms all other ABC data is intact.
It never recompiles Main or MissionPanel_2.

Backups/checksums: `backups/recruit-elements-20261028/manifest.json`.
Runtime check: select a five-element character, open Mission Room, switch recruit
tabs, add/remove a friend and reopen the panel. The player and team graphics must
remain visible, with no `MissionPanel_2/onRecruitFriend` errors in the Ruffle log.
