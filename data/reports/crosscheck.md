# Cross-check: OPTC-DB (2Shankz) vs the game's master data

OPTC-DB: 2Shankz/optc-db.github.io@a5689c133722e8ab7f80e02cb4be306e47824fc7 (2026-11-23T23:46:57Z, "Nov EoM Batch PVP Filters")
Game: sakura.db sha256 aa8c0dfb917618c3..., 6803 characters, newest row 2026-11-19T05:03:34.000Z
Built: 2026-11-25T19:05:20.357Z

Units compared: **4653** (joined to a game row).

| Check | Disagreements |
|---|---|
| Names (OPTC-DB name vs game name_ - subName_, letters and digits only) | 0 |
| Rumble style | 0 |
| Rumble DEF | 0 |
| Rumble SPD | 0 |
| Team cost (rumble.json cost vs piratesDeckCost_) | 0 |
| Rumble special cooldown per level (s) | 9 |
| Number of Rumble special levels | 0 |
| Max HP / ATK / RCV | 0 |
| Hits per attack (units.js combo vs comboNum_) | 0 |
| Rumble key tier (our keyGroup from flags.js vs the game's MstPiratesLimitBreak_ tier; same bonus numbers count as agreeing) | 411 |
| Units with a Rumble special that the game gives no Rumble key (no piratesLimitBreakAbilityId_; mostly forms before their last evolution); no key for these legal units in the app and simulator since 2026-11-17 | 517 |

## Rumble key: our keyGroup -> the game's tier (all joined units)

Game tiers by bonus: 1000-1004 = super; 1010/1020/1030 = anni / rumbleLegend; 1040 = legend; 1050/1060/2010 =
tmKizuna / rumbleRR; 2020/2021 = rr; 2030 and 100000 = rr stats but damage taken -5% (not -10%), no KEY_BONUS group.
The key's damage taken / dealt bonus applies against one color or class pair only (the unit's key ability).

| OPTC-DB -> game | Units |
|---|---|
| rr -> no key | 2948 |
| rr -> 100000 (20% HP, taken 5% dealt 0%) | 358 |
| legend -> 1040 (legend) | 357 |
| tmKizuna -> no key | 343 |
| rr -> 2020 (rr) | 211 |
| rumbleRR -> 2010 (tmKizuna/rumbleRR) | 69 |
| super -> 1000 (super) | 66 |
| rumbleLegend -> 1030 (anni/rumbleLegend) | 42 |
| tmKizuna -> 1060 (tmKizuna/rumbleRR) | 42 |
| anni -> 1010 (anni/rumbleLegend) | 40 |
| tmKizuna -> 1050 (tmKizuna/rumbleRR) | 36 |
| super -> no key | 35 |
| tmKizuna -> 100000 (20% HP, taken 5% dealt 0%) | 27 |
| rr -> 2030 (20% HP, taken 5% dealt 0%) | 22 |
| rumbleRR -> no key | 13 |
| anni -> no key | 10 |
| legend -> no key | 8 |
| super -> 1002 (super) | 7 |
| rr -> 2021 (rr) | 5 |
| super -> 1001 (super) | 4 |
| anni -> 1020 (anni/rumbleLegend) | 3 |
| legend -> 100000 (20% HP, taken 5% dealt 0%) | 2 |
| legend -> 1000 (super) | 2 |
| super -> 1004 (super) | 2 |
| super -> 1003 (super) | 1 |

## Rumble special cooldown per level (s) (9)

| Unit | Name | OPTC-DB | Game |
|---|---|---|---|
| 932 | Pica | 25,25,25,25,25,25,25,25,25,25 | 25,24,23,22,21,20,19,18,17,16 |
| 933 | Pica - Donquixote Pirates | 25,25,25,25,25,25,25,25,25,25 | 25,24,23,22,21,20,19,18,17,16 |
| 2987 | Soba Mask - Phantom of the Germa 66 | 27,27,27,27,27,27,27,27,27,27 | 28,28,28,28,28,28,28,28,28,28 |
| 3048 | Knight of the Sea Jinbe - Return of the Ritual Cup | 35,35,35,35,35,35,35,35,35,35 | 31,31,31,31,31,31,31,31,31,31 |
| 3101 | Law: Midnight Doctor - Happy Spooky Halloween! | 45,45,45,45,45,45,45,45,45,45 | 25,25,25,25,25,25,25,25,25,25 |
| 3279 | Marshall D. Teach - Overwhelming Two Powers | 28,28,28,28,28,28,28,28,28,28 | 33,33,33,33,33,33,33,33,33,33 |
| 3280 | Blackbeard - Overwhelming Two Powers | 28,28,28,28,28,28,28,28,28,28 | 33,33,33,33,33,33,33,33,33,33 |
| 3554 | Kin'emon & Denjiro - Samurai Challenging the Dragon | 31,27,27,27,27,27,27,27,27,27 | 27,27,27,27,27,27,27,27,27,27 |
| 3555 | Kin'emon & Denjiro - Shouldering His Master's Spirit | 31,27,27,27,27,27,27,27,27,27 | 27,27,27,27,27,27,27,27,27,27 |

## Rumble key tier (our keyGroup from flags.js vs the game's MstPiratesLimitBreak_ tier; same bonus numbers count as agreeing) (411)

| Unit | Name | OPTC-DB | Game |
|---|---|---|---|
| 227 | Hawk Eyes Mihawk | rr | 100000 (= no KEY_BONUS group; QCK) |
| 249 | Tony Tony Chopper - Post-Rampage | rr | 100000 (= no KEY_BONUS group; DEX) |
| 306 | Garp the Fist | rr | 100000 (= no KEY_BONUS group; INT) |
| 353 | Zephyr - Neo Marines Leader | rr | 100000 (= no KEY_BONUS group; PSY) |
| 390 | Emporio Ivankov - Queen of Kamabakka Queendom (Retired) | rr | 100000 (= no KEY_BONUS group; STR) |
| 418 | Donquixote Doflamingo - Warlord of the Sea | rr | 100000 (= no KEY_BONUS group; QCK) |
| 447 | Blackbeard | rr | 100000 (= no KEY_BONUS group; DEX) |
| 516 | Heracles-un - Hero of the Forest | rr | 100000 (= no KEY_BONUS group; INT) |
| 575 | Aokiji - Ice Man | rr | 100000 (= no KEY_BONUS group; PSY) |
| 578 | Monkey D. Luffy - Voyage Dream: Pirate King | legend | 100000 (= no KEY_BONUS group; DEX) |
| 603 | Eneru, Lightning Incarnate - 200,000,000 Volt Amaru | rr | 100000 (= no KEY_BONUS group; STR) |
| 654 | Duval - Rosy Life Riders Leader | rr | 100000 (= no KEY_BONUS group; QCK) |
| 795 | Nightmare Luffy - Warrior of Hope | rr | 100000 (= no KEY_BONUS group; PSY) |
| 836 | Tyrant Bartholomew Kuma - Government Human Weapon | rr | 100000 (= no KEY_BONUS group; DEX) |
| 865 | Empress Boa Hancock - Kuja Pirates Captain | rr | 100000 (= no KEY_BONUS group; INT) |
| 933 | Pica - Donquixote Pirates | rr | 100000 (= no KEY_BONUS group; INT) |
| 978 | Kizaru: Man of Light | rr | 100000 (= no KEY_BONUS group; STR) |
| 1047 | Sabo - Revolutionary Army Chief of Staff | rr | 100000 (= no KEY_BONUS group; QCK) |
| 1108 | Shiki the Golden Lion - Golden Lion Pirates | rr | 100000 (= no KEY_BONUS group; DEX) |
| 1163 | Gild. Tesoro - Gold Ship Casino King | rr | 100000 (= no KEY_BONUS group; INT) |
| 1298 | Akainu - Magma Man | rr | 100000 (= no KEY_BONUS group; DEX) |
| 1374 | Magellan - Jail Chief Warden | rr | 100000 (= no KEY_BONUS group; PSY) |
| 1518 | Bellamy the Hyena - The Bullet of Dressrosa | rr | 100000 (= no KEY_BONUS group; STR) |
| 1595 | Fujitora: Gravity Blade - Navy HQ Powerhouse | rr | 100000 (= no KEY_BONUS group; INT) |
| 1632 | Fisher Tiger - Sun Pirates Captain | rr | 100000 (= no KEY_BONUS group; INT) |
| 1696 | Bamboo Demon Vergo - Top Donquixote Family Officer | rr | 100000 (= no KEY_BONUS group; QCK) |
| 1713 | Akainu - Paramount War Hellfire | rr | 100000 (= no KEY_BONUS group; QCK) |
| 1721 | Big Boss Jinbe - Neptune's Army Soldier: Ryugu Kingdom | rr | 100000 (= no KEY_BONUS group; STR) |
| 1815 | Vinsmoke Sanji - Germa Kingdom | rr | 100000 (= no KEY_BONUS group; DEX) |
| 1824 | Byrnndi World - World Destroyer | rr | 100000 (= no KEY_BONUS group; DEX) |
| 1830 | Master Caesar - Lord of Gas | rr | 100000 (= no KEY_BONUS group; PSY) |
| 1879 | Man-Eating Bartolomeo - Captain of the Barto Club Pirates | rr | 100000 (= no KEY_BONUS group; INT) |
| 1924 | Dark King Rayleigh - First Mate of the Roger Pirates | rr | 100000 (= no KEY_BONUS group; DEX) |
| 1926 | Coby - Navy HQ Captain | rr | 100000 (= no KEY_BONUS group; PSY) |
| 1943 | Senor Pink - Real Man's Fight | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2015 | Rob Lucci - Dark Justice-Upholding Weapon | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2050 | Gecko Moria - Undead Army Leader | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2097 | Roronoa Zoro - Master Swordsman Felling the New World | rr | 100000 (= no KEY_BONUS group; STR) |
| 2158 | Thousand-Armed Cracker | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2161 | Donquixote Doflamingo - Strongman of the Paramount War | rr | 100000 (= no KEY_BONUS group; STR) |
| 2197 | Blackbeard - Former Warlord of the Sea | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2281 | "Garuda" Vinsmoke Judge - King of Germa | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2285 | Hody Jones - A Monster Born from His Environment | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2299 | Hancock - Love-Love Bat: Midnight Halloween Parade | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2356 | Enraged Arlong - Tyrannical Fish-Man | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2362 | Nami - Captivating Santa Girl | rr | 100000 (= no KEY_BONUS group; INT) |
| 2394 | Portgas D. Ace - Embodiment of the Whitebeard Era | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2398 | Big Emperor - Giant Robot Warrior | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2431 | Charlotte Pudding - Memory Flashback | rr | 100000 (= no KEY_BONUS group; INT) |
| 2473 | Big Mom - Hungry Onslaught | rr | 100000 (= no KEY_BONUS group; STR) |
| 2504 | Capone "Gang" Bege - Castle-Man of the Castle-Castle Fruit | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2517 | Magellan & Hannyabal - Guardians of the Fortress of Hell | rr | 100000 (= no KEY_BONUS group; Slasher/Striker) |
| 2531 | Zoro & Sanji - Peerless Straw Hat Pirates: Born Again | rr | 100000 (= no KEY_BONUS group; Fighter/Shooter) |
| 2642 | Kid & Killer - The Worst vs. The Strongest | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2643 | Bege & Apoo - The Worst vs. The Strongest | rr | 100000 (= no KEY_BONUS group; STR) |
| 2644 | Drake & Urouge - The Worst vs. The Strongest | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2645 | Bonney & Hawkins - The Worst vs. The Strongest | rr | 100000 (= no KEY_BONUS group; INT) |
| 2684 | Sabo - Back-to-Back Fire Fists | rr | 100000 (= no KEY_BONUS group; INT) |
| 2696 | Marco the Phoenix - Blue Flame in the Paramount War | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2698 | Sir Crocodile - Thirst Upon the Battlefield | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2781 | Carrot - Will-Bearing Sulong | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2792 | Orobi - Geisha | rr | 100000 (= no KEY_BONUS group; STR) |
| 2795 | Coby & Helmeppo - Shining Rookies of Navy HQ | rr | 100000 (= no KEY_BONUS group; Fighter/Driven) |
| 2819 | Shanks & Mihawk - World's Leading Two Swordsmen | rr | 100000 (= no KEY_BONUS group; Fighter/Driven) |
| 2823 | X Drake - Animal Kingdom Pirates, Tobi Roppo | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2831 | Marco & Ace - Dual Flames of the Whitebeard Pirates | rr | 100000 (= no KEY_BONUS group; Shooter/Driven) |
| 2846 | Big Eater Jewelry Bonney - Captain of the Bonney Pirates | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2850 | Rebecca & Viola - Princesses of Dressrosa | rr | 100000 (= no KEY_BONUS group; Slasher/Free Spirit) |
| 2885 | Cipher Pol No. 9 - Spandam & His Reliable Subordinates | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2886 | Cipher Pol No. 9: Neo - Spandam & His Reliable Subordinates | rr | 100000 (= no KEY_BONUS group; STR) |
| 2893 | Jinbe - Battle Between Wounded Allies | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2913 | Shirahoshi - Commitment to Protecting an Island | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2920 | Big Mom - Grieving Emperor | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2922 | Kaido - Deity Who Protects the Land | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2923 | Kaido: Neo - Deity Who Protects the Land | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2934 | Portgas D. Ace - Strength of Unyielding Flames | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2936 | Monkey D. Luffy - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2938 | Roronoa Zoro - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2940 | Nami - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2942 | Usopp - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2944 | Sanji - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2946 | Tony Tony Chopper - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2948 | Nico Robin - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2950 | Franky - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2952 | Brook - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 2955 | Carrot - Awakened True Nature: Sulong | rr | 100000 (= no KEY_BONUS group; DEX) |
| 2956 | Mr. 0 - Combat With No Rules | rr | 100000 (= no KEY_BONUS group; PSY) |
| 2977 | Monkey D. Luffy - Celebrate the Astonishing Cruise | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2987 | Soba Mask - Phantom of the Germa 66 | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2989 | Rob Lucci - Penetrating Dark Justice | rr | 100000 (= no KEY_BONUS group; QCK) |
| 2999 | Luffy & Hancock - Alliance Formed for the Sake of Training | rr | 100000 (= no KEY_BONUS group; Striker/Shooter) |
| 3016 | Blackbeard - Darkness Writhing in Hell | rr | 100000 (= no KEY_BONUS group; STR) |
| 3022 | Vinsmoke Reiju - The Science Military's True Worth | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3036 | Kaido - Creature Who Rules the Animal Kingdom | rr | 100000 (= no KEY_BONUS group; STR) |
| 3045 | Charlotte Linlin - Charlotte Family Vacation | rr | 100000 (= no KEY_BONUS group; INT) |
| 3047 | Kami Eneru - Deity Seeking the World of Dreams | rr | 100000 (= no KEY_BONUS group; INT) |
| 3052 | Buggy - Flashily Enjoying the Festival | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3060 | Nami & Sanji - Cheery Summer Festival | rr | 100000 (= no KEY_BONUS group; Shooter/Driven) |
| 3078 | Soul King Brook - A Musician Who Fights With Soul | rr | 100000 (= no KEY_BONUS group; INT) |
| 3082 | Usoland - The Sniper's Path | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3085 | Perospero - Troublesome Candy | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3094 | Jinbe - Attack From the Sea | rr | 100000 (= no KEY_BONUS group; INT) |
| 3098 | Sakazuki & Borsalino - Strength of the Most Powerful | rr | 100000 (= no KEY_BONUS group; Fighter/Powerhouse) |
| 3107 | Moria & Perona - Beginning of the Nightmare | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3108 | Crocodile: Ruler of the Night - Happy Spooky Halloween! | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3115 | Pudding: Sweet Witch - Happy Spooky Halloween! | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3124 | Kid: Banquet of Fear - Happy Spooky Halloween! | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3142 | Drake - An Ancient Threat | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3143 | Onami & Shinobu - Two Charming Kunoichi | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3150 | Eustass Kid - Unyielding Prisoner | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3153 | Basil Hawkins - Foretelling the Future | rr | 100000 (= no KEY_BONUS group; INT) |
| 3171 | Coby - White Christmas Night | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3172 | Hina - Dazzling Night | rr | 100000 (= no KEY_BONUS group; STR) |
| 3173 | Bartolomeo - Worth Risking One's Life For | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3175 | Kozuki Oden - Heir to the Shogun of Wano | legend | 1000 (= super; DEX) |
| 3177 | Gol D. Roger - Captain of the Roger Pirates | legend | 1000 (= super; INT) |
| 3188 | Edward Newgate - Great Pirate | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3197 | Monkey D. Garp - An Indulgent Christmas | rr | 100000 (= no KEY_BONUS group; INT) |
| 3207 | Bege & Pez - A Night to Enjoy With My Boy | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3208 | Hawkins - Plan-Sabotaging Headliner | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3209 | Luffytaro - Prepared to Die | rr | 100000 (= no KEY_BONUS group; INT) |
| 3213 | Onami & Orobi - Brave Women in Wano | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3217 | Komurasaki - Graceful Beauty | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3222 | Hiyori - Mysterious Beauty | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3223 | Otoko - Girl on the Run | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3233 | Lucy - Unexpected Champion | rr | 100000 (= no KEY_BONUS group; STR) |
| 3239 | Queen - Rampaging Brachiosaurus | rr | 100000 (= no KEY_BONUS group; STR) |
| 3241 | King - Incoming Pteranodon | rr | 100000 (= no KEY_BONUS group; STR) |
| 3251 | Hannyabal - Pride of the Under Warden | rr | 100000 (= no KEY_BONUS group; STR) |
| 3273 | Luffy & Ace - Brothers in Battle | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3276 | Doflamingo - Enjoying the Change of an Era | rr | 100000 (= no KEY_BONUS group; STR) |
| 3285 | Vergo - Returning Fear | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3286 | Jesus Burgess - Champion on the Attack | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3287 | Vasco Shot | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3297 | Shiryu - Second Ship Captain of the Blackbeard Pirates | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3303 | Charlotte Katakuri - Overwhelming Power of Mochi | rr | 100000 (= no KEY_BONUS group; INT) |
| 3304 | Cavendish - Elegant Swordsman on a White Horse | rr | 100000 (= no KEY_BONUS group; STR) |
| 3305 | Bartolomeo - Bull Charging Towards His Dream | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3332 | Urouge - Battles With the Sweet Generals | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3339 | Koala - Celebrate the Fabulous Cruise | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3346 | Kaido & Big Mom - Worst Alliance Ever | rr | 100000 (= no KEY_BONUS group; Cerebral/Powerhouse) |
| 3351 | Kuja Pirates | rr | 100000 (= no KEY_BONUS group; STR) |
| 3352 | Kuja Pirates - Hardened Female Pirates | rr | 100000 (= no KEY_BONUS group; STR) |
| 3353 | Blackbeard - Duel at Banaro Island | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3365 | Monkey D. Luffy - MUGIWARA 56 | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 3366 | Tony Tony Chopper - MUGIWARA 56 | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 3367 | Nami - MUGIWARA 56 | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 3368 | Roronoa Zoro - MUGIWARA 56 | rr | 100000 (= no KEY_BONUS group; INT) |
| 3370 | Nico Robin - MUGIWARA 56 | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 3371 | Usopp - MUGIWARA 56 | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 3372 | Franky - MUGIWARA 56 | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 3373 | Brook - MUGIWARA 56 | rr | 100000 (= no KEY_BONUS group; INT) |
| 3374 | Dark King Rayleigh - Evenly Matched Battle | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3382 | Denjiro - Overrated Samurai | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3389 | Kaido - Intercepting Dragon | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3394 | Jack - Rampaging Drought | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3396 | Ryuma - Resurrected Samurai of Wano | rr | 100000 (= no KEY_BONUS group; STR) |
| 3397 | Jack the Drought - Trampling Disaster | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3399 | Buggy's Delivery | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3400 | Monet - Summer Night Vacation | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3401 | Baby 5 - Summer Night Vacation | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3415 | Hody Jones - Battle at Conchcorde Plaza | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3416 | Stussy - Elegant CP Agent Enjoying the Summer Festival | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3419 | Emporio Ivankov - New Kama Shining in Hell | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3425 | Morgans | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3436 | Drake - Tobi Roppo Assembled | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3438 | Charlotte Oven - Burning Will | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3439 | Roronoa Zoro - Swordsman in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 3440 | Sanji - Cook in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; PSY) |
| 3441 | Nami - Navigator in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 3442 | Brook - Musician in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; PSY) |
| 3443 | Monkey D. Luffy - Straw Hat in Disguise | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3444 | Jinbe - Helmsman in Disguise | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3445 | Nico Robin - Archeologist in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; PSY) |
| 3446 | Chopper & Usopp - Ship Doctor and Sniper in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 3447 | Franky - Shipwright in Disguise | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 3449 | Olin - Emperor in Preparation | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3450 | Olin the Oiran | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3457 | Soul King: Halloween Musician - Night of Halloween | rr | 100000 (= no KEY_BONUS group; STR) |
| 3466 | Helmeppo - Stunning Swords Play | rr | 100000 (= no KEY_BONUS group; STR) |
| 3467 | Robin: Halloween Avatar of the Night - Night of Halloween | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3468 | Viola: Halloween Dance Party - Night of Halloween | tmKizuna | 100000 (= no KEY_BONUS group; DEX) |
| 3470 | Rebecca: Halloween Sweets Party - Night of Halloween | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3477 | Charlotte Cracker - Unexpected Strike | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3481 | Don Chin Jao - Hatred Spanning Generations | rr | 100000 (= no KEY_BONUS group; STR) |
| 3486 | Wyper - Willing to Die for a Cause | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3487 | Buggy - Battle at Orange Town | tmKizuna | 100000 (= no KEY_BONUS group; DEX) |
| 3488 | Captain Kuro of the Thousand Plans - Battle on the Hill | tmKizuna | 100000 (= no KEY_BONUS group; STR) |
| 3489 | Don Krieg - Responding with Brute Force | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3490 | Krieg Pirates | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3491 | Gecko Moria - Fierce Fight Until Dawn | rr | 100000 (= no KEY_BONUS group; STR) |
| 3498 | Olin the Oiran - Insurmountable Threat | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3505 | Foxy & Porche | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3506 | Hyogoro the Flower | rr | 100000 (= no KEY_BONUS group; STR) |
| 3509 | Orochi - Irate Shogun | tmKizuna | 100000 (= no KEY_BONUS group; STR) |
| 3511 | Zorojuro & Sangoro | rr | 100000 (= no KEY_BONUS group; STR) |
| 3518 | Monkey D. Garp - Fist-Tightened Vice Admiral | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3520 | Admiral Sengoku - Cunning Officer Upholding Justice in the Great Era of Piracy | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3526 | Wapol - True Power of the Munch-Munch Fruit | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3527 | Tashigi - Furious Captain | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3528 | Portgas D. Ace - Memories of the Land of Wano | tmKizuna | 100000 (= no KEY_BONUS group; DEX) |
| 3529 | Marco - Azure Bird Arriving in Wano | tmKizuna | 100000 (= no KEY_BONUS group; STR) |
| 3531 | Marshall D. Teach - Rising to the Seat of Emperor | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3532 | Blackbeard - Threat of Darkness and Tremors | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3539 | Jack - Dragon-Defending Drought | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3546 | Boa Marigold - Burning Snake | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3547 | Charlotte Perospero - Eldest Brother out to Finish the Job | rr | 100000 (= no KEY_BONUS group; STR) |
| 3548 | Miyagi & Tristan | tmKizuna | 100000 (= no KEY_BONUS group; STR) |
| 3549 | Milky | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 3551 | Tony Tony Chopper - Charmed Reindeer Doctor | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3559 | Orochi's Oniwabanshu | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3560 | Kaido - Confronting a Lingering Memory From the Past | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3567 | Kurozumi Kanjuro - Headless Samurai Warriors | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3568 | Komurasaki - Oiran's Way of Life | tmKizuna | 100000 (= no KEY_BONUS group; STR) |
| 3569 | Shinobu - Mature Charm | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 3571 | Orochi - Unrelenting Rage | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3572 | Orochi - Eight-Headed Snake's Fury | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3579 | Sasaki - Superb Armored Division | rr | 100000 (= no KEY_BONUS group; STR) |
| 3587 | Donquixote Doflamingo - Tragedy at Minion Island | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3588 | Ulti - Splitting Headbutt | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3601 | Charlotte Katakuri - Willow Pursuit | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3619 | Kozuki Oden - Aspiring to the Grand Voyage | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3620 | Kozuki Oden - Traveling to the Final Island | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3621 | Sabo - Flaming Heart of a Revolutionary | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3626 | Gol D. Roger - Great Pirate With Grand Dreams | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3627 | Gol D. Roger - Reaching the Final Island | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3634 | Killer - Grand Opening Attack | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3644 | Chaka - Loyalty Even Unto Death | rr | 100000 (= no KEY_BONUS group; STR) |
| 3645 | Gecko Moria - Invading Lord of Shadows | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3648 | Magellan & Hannyabal - Warden and Under Warden of Impel Down | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3657 | X Drake - One Man Army Holding the Line | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3663 | Franky - Shipwright Grooving at Sea | rr | 100000 (= no KEY_BONUS group; INT) |
| 3668 | Monkey D. Luffy - Captain Excited at the Sea | rr | 100000 (= no KEY_BONUS group; INT) |
| 3669 | Monkey D. Luffy - Captain Shining at Sea | rr | 100000 (= no KEY_BONUS group; INT) |
| 3672 | Monkey D. Luffy - Straw Hat Pirates Enjoying the FES | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3678 | Toki - Summer Festival With Her Loved Ones | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3689 | Sanji - Straw Hat Pirates Enjoying the FES | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3701 | Uta - Dream Chasing Uta World | rr | 100000 (= no KEY_BONUS group; STR) |
| 3702 | Adio - Waford Adventurer | rr | 100000 (= no KEY_BONUS group; STR) |
| 3712 | Tony Tony Chopper - Ship Doctor Entering Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 3713 | Uta - Dream Fulfilling Uta World | rr | 100000 (= no KEY_BONUS group; STR) |
| 3719 | Shanks - Impeding Emperor | rr | 100000 (= no KEY_BONUS group; INT) |
| 3720 | Red-Haired Shanks - Father Caring for His Daughter | rr | 100000 (= no KEY_BONUS group; INT) |
| 3728 | Luffy & Whitebeard - Sharing the Same Goal | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3736 | Trafalgar Law - Wave of the New Era | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3743 | Doflamingo: Horror Night Parade - Creepy Night Halloween | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3750 | Kaido - Dragon Confronting the Moonlight | rr | 100000 (= no KEY_BONUS group; STR) |
| 3758 | Olin the Oiran - Climate Controlling Emperor | rr | 100000 (= no KEY_BONUS group; STR) |
| 3763 | Brook - Armored for Battle | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3764 | Brook - Armored Warrior Prepared for the Raid | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3770 | Ulti - Chasing Tobi Roppo | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3773 | Sasaki - Full Potential of a Triceratops | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3778 | Who's-Who - Redirecting His Grudge | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3785 | Monkey D. Luffy - Brimming Haki Strike | rr | 100000 (= no KEY_BONUS group; STR) |
| 3795 | Law & Kid - Cooperating Captains | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3796 | Black Maria - Offensive Repel | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3801 | Wyper - Kami Defying Warrior | rr | 100000 (= no KEY_BONUS group; STR) |
| 3806 | Donquixote Doflamingo - Game-Ending Bullet String | rr | 100000 (= no KEY_BONUS group; STR) |
| 3807 | Donquixote Doflamingo - Birdcage Enclosing on Peace | rr | 100000 (= no KEY_BONUS group; STR) |
| 3815 | Kozuki Oden - Welcoming Feast | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3822 | Izo - Diligent Persuasion | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3835 | Yamato - Unexpected Request | rr | 100000 (= no KEY_BONUS group; STR) |
| 3842 | Fujitora - Unswaying Stance | rr | 100000 (= no KEY_BONUS group; STR) |
| 3847 | Monkey D. Garp - Scolding His Grandson | rr | 100000 (= no KEY_BONUS group; INT) |
| 3848 | Monkey D. Garp - Disciplining the Brats | rr | 100000 (= no KEY_BONUS group; INT) |
| 3855 | Inbi & Fuga & Zanki | rr | 100000 (= no KEY_BONUS group; INT) |
| 3856 | Luffy & Law & Kid | rr | 100000 (= no KEY_BONUS group; INT) |
| 3857 | Luffy & Law & Kid - Incoming Flames | rr | 100000 (= no KEY_BONUS group; INT) |
| 3864 | Capone "Gang" Bege - Overwhelming Military Power | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3874 | Marco - Parrying Blue Flame | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3884 | Jinbe - Straw Hat Pirates: Mark of a Fierce Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 3885 | Gol D. Roger - Parting of the King of the Pirates | rr | 100000 (= no KEY_BONUS group; STR) |
| 3886 | Monkey D. Luffy - Man to Surpass the Emperors | rr | 100000 (= no KEY_BONUS group; INT) |
| 3887 | Kaido - Punishing Club | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3894 | Kozuki Momonosuke - Confrontment of the Dragons | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3903 | Kaido - Punishing the Child of Ogres | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3915 | Akainu - Pirate-Chasing Admiral | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3927 | Sanji - Meeting the Goddesses After Two Years | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3931 | Vinsmoke Reiju - Caring Sister | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3936 | Charlotte Flampe - Attentive Little Sister | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3941 | Perona - Sudden News | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3942 | Perona - Tearful Departure | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3946 | Jewelry Bonney - Infiltrating the Sacred Land | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3952 | Maha | rr | 100000 (= no KEY_BONUS group; QCK) |
| 3965 | Yamato - Aspiring Beyond the Horizon | rr | 100000 (= no KEY_BONUS group; INT) |
| 3976 | Otama - Contributing to the Fight | rr | 100000 (= no KEY_BONUS group; INT) |
| 3981 | Lead Performers - Impeding Disasters | rr | 100000 (= no KEY_BONUS group; DEX) |
| 3990 | Yamato - Dashing Through the Castle | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3991 | Yamato - Holding Back the Explosion | rr | 100000 (= no KEY_BONUS group; PSY) |
| 3999 | Gordon - Tragedy of Twelve Years Ago | rr | 100000 (= no KEY_BONUS group; INT) |
| 4006 | Baccarat & Dice & Mr. Tanaka | rr | 100000 (= no KEY_BONUS group; STR) |
| 4021 | Makino & Luffy & Uta | rr | 100000 (= no KEY_BONUS group; INT) |
| 4024 | Monkey D. Luffy - Yearning for Adventure | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4025 | Blueno & Bepo & Sunny-kun | rr | 100000 (= no KEY_BONUS group; INT) |
| 4033 | Blueno & Bepo & Sunny-kun - Fleeing Little Ones | rr | 100000 (= no KEY_BONUS group; INT) |
| 4038 | Eustass Kid - New Generation Overtaking the Emperor | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4039 | Eustass "Captain" Kid - Pulverizing Magnetism | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4047 | Monkey D. Luffy - Enjoying the Flavor of the Festival | rr | 100000 (= no KEY_BONUS group; STR) |
| 4053 | Monkey D. Luffy - Fireworks Lighting the Skies of Wano | rr | 100000 (= no KEY_BONUS group; STR) |
| 4066 | Edward Newgate - Anger's Restraint | rr | 100000 (= no KEY_BONUS group; STR) |
| 4074 | Edward Newgate - Anger of Family Being Taken Away | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4078 | King - Last Survivor of Lunaria Race | rr | 100000 (= no KEY_BONUS group; STR) |
| 4079 | Alber - Fight of the Right-Hand Men | rr | 100000 (= no KEY_BONUS group; STR) |
| 4085 | Monkey D. Luffy - Encounter of the Next Journey | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4088 | Jinbe - Confronting the Raging Sea | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4089 | Jinbe - Rescue from the Raging Sea | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4107 | Coby - Hero of the Rocky Port Incident | rr | 100000 (= no KEY_BONUS group; INT) |
| 4108 | Coby - Intensifying Battle | rr | 100000 (= no KEY_BONUS group; INT) |
| 4119 | X Drake - Being Chased | rr | 100000 (= no KEY_BONUS group; STR) |
| 4120 | X Drake - Life-Risking Hope | rr | 100000 (= no KEY_BONUS group; STR) |
| 4127 | Lucci & Kaku & Stussy - Headed to the Future Island | rr | 100000 (= no KEY_BONUS group; STR) |
| 4128 | Lucci & Kaku & Stussy - Landing Government Agents | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4129 | Luffy (Age 70) - A Different Future | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4130 | Monkey D. Luffy - Mysterious Suit of the Nation of Science | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4131 | Monkey D. Luffy - Warrior in White Going Wild | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4146 | Blackbeard - After the Road Ponegliff | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4147 | Blackbeard - Starting the Battle of the Worst Generation | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4163 | Yamato - Send-Off Embrace | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4164 | Yamato - Following the Same Path | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4176 | Dracule Mihawk - Testing Black Blade | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4177 | Hawk Eyes Mihawk - The Strongest Swordsman who Recognizes Potential | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4190 | Arlong - Laughing-Off the Hard Luck | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4191 | Arlong - Ruling for Eight Years | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4200 | Gecko Moria - Knowing the Harshness of the World | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4201 | Gecko Moria - Smashing the Sprout | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4205 | Portgas D. Ace - Aiming for a Powerful Foe | rr | 100000 (= no KEY_BONUS group; STR) |
| 4206 | Portgas D. Ace - Crew-Protecting Flame Fence | rr | 100000 (= no KEY_BONUS group; STR) |
| 4208 | Kozuki Hiyori - Graveside Prayer | rr | 2030 (= no KEY_BONUS group; PSY) |
| 4209 | Kozuki Hiyori - Resounding Shamisen | rr | 2030 (= no KEY_BONUS group; PSY) |
| 4224 | Bepo - Captain-Protecting Navigator | rr | 100000 (= no KEY_BONUS group; INT) |
| 4225 | Bepo - Captain-Protecting Sulong | rr | 100000 (= no KEY_BONUS group; INT) |
| 4245 | Kuzan - Way of Life Learned from His Mentor | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4246 | Kuzan - Fists Aimed Toward His Mentor | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4260 | Dr. Vegapunk - Head of the Punk Hazard Research Facility | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4261 | Dr. Vegapunk - Flowers for the Deceased | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4265 | Roronoa Zoro - Strike Against the Flame | rr | 2030 (= no KEY_BONUS group; PSY) |
| 4266 | Roronoa Zoro - Determining His True Potential | rr | 2030 (= no KEY_BONUS group; PSY) |
| 4279 | Orochi & Kanjuro - Revenge Against the Land of Wano | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4280 | Orochi & Kanjuro - Kurozumi that Despises the Light | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4297 | Akainu - Justice Captures Evil | rr | 100000 (= no KEY_BONUS group; STR) |
| 4298 | Sakazuki - Admiral Determined to Eradicate Evil | rr | 100000 (= no KEY_BONUS group; STR) |
| 4311 | S-Shark - Seraphim's Sudden Attack | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4312 | S-Shark - Impeding Weapon | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4317 | Dr. Vegapunk - Drained Age | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4318 | Dr. Vegapunk - Genius Scientist Turned to a Child | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4326 | S-Bear - Assaulting Weapon | rr | 100000 (= no KEY_BONUS group; STR) |
| 4327 | S-Bear - Defying Orders | rr | 100000 (= no KEY_BONUS group; STR) |
| 4341 | Monet - The Snow-Woman in the Biscuits Room | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4342 | Monet - Swordsman-Assaulting Wings | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4351 | Monkey D. Luffy: Neo - Mysterious Suit of the Nation of Science | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4352 | Monkey D. Luffy: Neo - Warrior in White Going Wild | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4357 | Dr. Vegapunk "York the Greedy" - Orchestrated Chaos | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4358 | Dr. Vegapunk "York the Greedy" - Cornered Traitor | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4373 | Dracule Mihawk - Opening of an Era-Changing War | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4374 | Hawk Eyes Mihawk - Swordsman Changing the Tide | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4375 | Nico Robin - Gratitude to the Ship Doctor | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 4376 | Jinbe - Completing the Mission | tmKizuna | 100000 (= no KEY_BONUS group; QCK) |
| 4384 | Sanji & Franky | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4385 | Sanji & Franky - Facing the World's Greatest Power | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4398 | Boa Hancock - Glittering Sea Spray | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4399 | Boa Hancock - Empress of the Sea Spray | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4413 | Charlotte Linlin - Pirate Aiming for the Plunder | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4414 | Charlotte Linlin - Seizing the Devil Fruit | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4416 | Sentomaru - Babysitting the Rowdy Girl | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4417 | Sentomaru - Peaceful Dining | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4429 | Kizaru - Difficult Mission | rr | 100000 (= no KEY_BONUS group; INT) |
| 4430 | Kizaru - Regret-Filled Thrust | rr | 100000 (= no KEY_BONUS group; INT) |
| 4447 | Monkey D. Luffy - Laugh Echoing on the Battlefield | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4448 | Monkey D. Luffy - Marked Enemy to Shoot | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4463 | Charlotte Pudding - Abducted 35th Daughter | rr | 100000 (= no KEY_BONUS group; STR) |
| 4464 | Charlotte Pudding - Imprisoned 35th Daughter | rr | 100000 (= no KEY_BONUS group; STR) |
| 4467 | Bonney - Ninth Birthday | rr | 2030 (= no KEY_BONUS group; PSY) |
| 4468 | Bonney - Picturing the Ideal Future | rr | 2030 (= no KEY_BONUS group; PSY) |
| 4480 | Eustass Kid - Pointing the Finger at the Traitor | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4481 | Eustass "Captain" Kid - Trump Card to Take Down an Emperor | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4496 | Doll & Bluegrass | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4497 | Doll & Bluegrass - Youthful Vice Admirals | rr | 100000 (= no KEY_BONUS group; DEX) |
| 4510 | Vinsmoke Reiju - Hazy Memories | rr | 100000 (= no KEY_BONUS group; STR) |
| 4511 | Vinsmoke Reiju - Sheltering Straw Hat from Danger | rr | 100000 (= no KEY_BONUS group; STR) |
| 4513 | Orobi - Infiltrating Geisha | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4514 | Orobi - Geisha Confronting the Shinobi | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4526 | Shiryu - Commotion at the Tavern | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4527 | Shiryu - Readied for Battle Against the Chill | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4540 | Rob Lucci - Final Strike Against the Swordsman | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4541 | Rob Lucci - Standing on the Battlefield Beyond One's Limits | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4554 | Dr. Vegapunk - Intense Worldwide Broadcast | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4555 | Dr. Vegapunk "Edison the Thinker" - One Body, Many Hearts | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4572 | Gol D. Roger - Recalling the Promise | rr | 2030 (= no KEY_BONUS group; INT) |
| 4573 | Gol D. Roger - The Beginning of the Great Age of Pirates | rr | 2030 (= no KEY_BONUS group; INT) |
| 4574 | St. Ethanbaron V. Nusjuro - Approaching Monstrous Horse | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4575 | St. Ethanbaron V. Nusjuro - Appearance of Bakotsu | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4588 | Rodo | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4589 | Rodo - Sun God of the Mini-World | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4601 | Monkey D. Garp - Landing Legend | rr | 100000 (= no KEY_BONUS group; STR) |
| 4602 | Monkey D. Garp - Engaging the Former Protege | rr | 100000 (= no KEY_BONUS group; STR) |
| 4618 | Collun | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4619 | Collun - Sword-Wielding Young Warrior | rr | 100000 (= no KEY_BONUS group; QCK) |
| 4620 | Shanks - Announcing His Name | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4621 | Shanks - Talking with an Old Acquaintance | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4638 | Monkey D. Luffy - Playing with the Giant Swing | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4639 | Monkey D. Luffy - Countering the Ambush | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4651 | Sir Crocodile: Ruler's Delectation - Happy Spooky Halloween! | rr | 100000 (= no KEY_BONUS group; PSY) |
| 4654 | Sanji - Jolly Halloween Party | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 4655 | Brook - Jolly Halloween Party | tmKizuna | 100000 (= no KEY_BONUS group; INT) |
| 4656 | Pudding: Tricked Witch - Happy Spooky Halloween! | rr | 100000 (= no KEY_BONUS group; INT) |
| 4669 | Mr. Ya - Mysterious Preacher of Love | rr | 100000 (= no KEY_BONUS group; STR) |
| 4670 | Scopper Gaban - Legendary Figure | rr | 100000 (= no KEY_BONUS group; STR) |
| 4671 | Brook - Confronting the Intruder | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4672 | Brook - Musician Standing Against a God | rr | 2030 (= no KEY_BONUS group; QCK) |
| 4685 | Saintess Gunko - Holy Knight Eating Her Meal | rr | 100000 (= no KEY_BONUS group; QCK) |
| 5014 | Monkey D. Luffy - To Become a True Kung Fu Master | legend | 100000 (= no KEY_BONUS group; QCK) |

## Units with a Rumble special that the game gives no Rumble key (no piratesLimitBreakAbilityId_; mostly forms before their last evolution); no key for these legal units in the app and simulator since 2026-11-17 (517)

| Unit | Name | OPTC-DB | Game |
|---|---|---|---|
| 13 | Usopp | rr | none |
| 14 | Usopp - Tabasco Star | rr | none |
| 15 | Usopp - Usopp Golden Pound | rr | none |
| 226 | Dracule Mihawk | rr | none |
| 248 | Tony Tony Chopper - Pre-Rampage | rr | none |
| 252 | Jozu | rr | none |
| 256 | Izo | rr | none |
| 258 | Blamenco | rr | none |
| 260 | Edward Newgate | rr | none |
| 305 | Monkey D. Garp | rr | none |
| 352 | Zephyr | rr | none |
| 366 | Silvers Rayleigh | rr | none |
| 389 | Emporio Ivankov | rr | none |
| 413 | Gecko Moria | rr | none |
| 415 | Boa Hancock | rr | none |
| 417 | Donquixote Doflamingo | rr | none |
| 446 | Marshall D. Teach | rr | none |
| 458 | Sengoku | rr | none |
| 515 | Heracles-un | rr | none |
| 529 | Shanks - Black Clad Redhead | rr | none |
| 561 | Portgas D. Ace - Black Clad Flame Fist | rr | none |
| 574 | Aokiji | rr | none |
| 577 | Monkey D. Luffy - Voyage Log: Straw Hat Pirates | rr | none |
| 602 | Eneru - 200,000,000 Volt Amaru | rr | none |
| 648 | Marco - Whitebeard 1st Div. Commander | rr | none |
| 652 | Iron Mask Duval | rr | none |
| 653 | Duval - Flying Fish Riders Leader | rr | none |
| 668 | Sabo | rr | none |
| 717 | Dracule Mihawk - Warlord of the Sea | rr | none |
| 719 | Sir Crocodile: Logia - Warlord of the Sea | rr | none |
| 747 | Rob Lucci - CP9 Dark Justice | rr | none |
| 749 | Kaku - CP9 Dark Justice | rr | none |
| 751 | Kalifa - CP9 Dark Justice | rr | none |
| 753 | Jabra - CP9 Dark Justice | rr | none |
| 755 | Blueno - CP9 Dark Justice | rr | none |
| 757 | Fukuro - CP9 Dark Justice | rr | none |
| 759 | Kumadori - CP9 Dark Justice | rr | none |
| 770 | Dalmatian - Marine Vice Admiral | rr | none |
| 771 | Momonga - Marine Vice Admiral | rr | none |
| 772 | Onigumo - Marine Vice Admiral | rr | none |
| 794 | Monkey D. Luffy - Star of Hope | rr | none |
| 835 | Tyrant Bartholomew Kuma | rr | none |
| 841 | Monet | rr | none |
| 864 | Boa Hancock - Kuja Pirates Captain | rr | none |
| 869 | Donquixote Doflamingo - Donquixote Pirates | rr | none |
| 871 | Sugar | rr | none |
| 875 | Trebol | rr | none |
| 899 | Mr. 2 Bon Clay  - Uncertain Samurai | rr | none |
| 932 | Pica | rr | none |
| 934 | Knight of the Sea Jinbe | rr | none |
| 977 | Kizaru | rr | none |
| 998 | Diamante | rr | none |
| 1000 | Corazon - Donquixote Pirates | rr | none |
| 1034 | Bartolomeo | rr | none |
| 1044 | Trafalgar Law - Worst Generation | rr | none |
| 1046 | Sabo - Dragon Claws | rr | none |
| 1048 | Nico Olvia | rr | none |
| 1049 | Nico Olvia - Ohara Archaeologist | rr | none |
| 1082 | Don Sai | rr | none |
| 1084 | Fujitora | rr | none |
| 1107 | Shiki the Golden Lion | rr | none |
| 1120 | Monkey D. Luffy - In the Wake of an Endless Dream - Straw Hat Pirates | rr | none |
| 1122 | Cavendish | rr | none |
| 1126 | Orlumbus | rr | none |
| 1162 | Gild. Tesoro | rr | none |
| 1187 | Atmos | rr | none |
| 1191 | Aokiji - Navy HQ Powerhouse | rr | none |
| 1239 | Kizaru - Navy HQ Powerhouse | rr | none |
| 1267 | Marshall D. Teach - Blackbeard Pirate Captain | rr | none |
| 1297 | Akainu | rr | none |
| 1313 | Akainu - Navy HQ Powerhouse | rr | none |
| 1361 | Roronoa Zoro - Straw Hat Pirates: Reunited | rr | none |
| 1373 | Magellan | rr | none |
| 1383 | Toy Soldier | rr | none |
| 1384 | Toy Soldier - Thunder Soldier | rr | none |
| 1390 | Buggy the Clown - Captain of the Buggy Pirates | rr | none |
| 1403 | Monkey D. Luffy - Straw Hat Pirates: Reunited | rr | none |
| 1433 | Hody Jones - New Fish-Man Pirates Executive | rr | none |
| 1437 | Ikaros Much - New Fish-Man Pirates | rr | none |
| 1439 | Daruma - New Fish-Man Pirates | rr | none |
| 1441 | Zeo - New Fish-Man Pirates | rr | none |
| 1472 | Princess Shirahoshi | rr | none |
| 1517 | Bellamy the Hyena - Former Captain of the Bellamy Pirates | rr | none |
| 1531 | Usoland | rr | none |
| 1563 | The Fighting King, Elizabello II | rr | none |
| 1564 | The Fighting King, Elizabello II - Kingdom of Prodence | rr | none |
| 1570 | Dogstorm | rr | none |
| 1580 | Trafalgar Law - Punk Hazard Resident | rr | none |
| 1581 | Trafalgar Law - Second Savior | rr | none |
| 1587 | Sanji - Third Son, Vinsmoke Family | rr | none |
| 1594 | Fujitora - Navy HQ Powerhouse | rr | none |
| 1609 | Kami Eneru - Arch-Enemies of an Endless Dream | rr | none |
| 1631 | Fisher Tiger | rr | none |
| 1648 | Giolla - Art-Woman | rr | none |
| 1649 | Giolla - Trebol Army | rr | none |
| 1651 | Cat Viper | rr | none |
| 1689 | Eustass Kid - Supernova of the South Blue | rr | none |
| 1690 | Captain Kid - Supernova of the South Blue | rr | none |
| 1695 | Bamboo Demon Vergo | rr | none |
| 1697 | Magellan - Prison Ruler | rr | none |
| 1712 | Akainu - Paramount War Firestarter | rr | none |
| 1720 | Jinbe - Neptune's Army Soldier: Ryugu Kingdom | rr | none |
| 1746 | Boa Hancock - Straw Hat Luffy's Contributor | rr | none |
| 1750 | "Surgeon of Death" Trafalgar Law - Joker-Tracking Heart | rr | none |
| 1762 | Rob Lucci - World Government Monster | rr | none |
| 1793 | Lucy - Star of Corrida Coliseum | rr | none |
| 1809 | Wanda - Mokomo Dukedom | rr | none |
| 1810 | Wanda: Kingsbird - Mokomo Dukedom | rr | none |
| 1811 | Carrot - Mokomo Dukedom | rr | none |
| 1812 | Carrot: Kingsbird - Mokomo Dukedom | rr | none |
| 1814 | Vinsmoke Sanji | rr | none |
| 1823 | Byrnndi World - More-More Fruit User | rr | none |
| 1829 | Caesar Clown - Lord of Gas | rr | none |
| 1831 | Vinsmoke Judge | rr | none |
| 1841 | Caribou - Next-Generation Supernova | rr | none |
| 1842 | Wet-Haired Caribou - Next-Generation Supernova | rr | none |
| 1854 | Scratchmen Apoo - Supernova | rr | none |
| 1855 | "Roar of the Sea" Scratchmen Apoo - Supernova | rr | none |
| 1866 | Basil Hawkins - Supernova | rr | none |
| 1867 | "Magician" Basil Hawkins - Supernova | rr | none |
| 1868 | Fujitora - The International Military Draft's New Admiral | rr | none |
| 1878 | Bartolomeo - Captain of the Barto Club Pirates | rr | none |
| 1882 | Silvers Rayleigh - Old Man Watching Over the New Age | rr | none |
| 1890 | Perona - Ruins of the Muggy Kingdom | rr | none |
| 1891 | Ghost Princess Perona - Ruins of the Muggy Kingdom | rr | none |
| 1892 | Dracule Mihawk - Ruins of the Muggy Kingdom | rr | none |
| 1893 | Hawk Eyes Mihawk - Ruins of the Muggy Kingdom | rr | none |
| 1909 | Donquixote Doflamingo - Current King of Dressrosa | rr | none |
| 1917 | Vinsmoke Reiju - Germa Resurrection Plan | rr | none |
| 1918 | Vinsmoke Reiju - Germa Resurrection Plan: Masterpiece | rr | none |
| 1923 | Silvers Rayleigh - First Mate of the Roger Pirates | rr | none |
| 1925 | Coby - Supply Ship Officer | rr | none |
| 1934 | Franky - Straw Hat Pirates' Secret Weapon | rr | none |
| 1942 | Senor Pink - Free Swimmer | rr | none |
| 1950 | Nico Robin - Successor to the Will of Ohara | rr | none |
| 1964 | Oars - Reborn Legend | rr | none |
| 1965 | Devil Oars - Reborn Legend | rr | none |
| 1984 | Luffy & Ace - Battlefield Reunion | rr | none |
| 1994 | Marco - Whitebeard's "Son" | rr | none |
| 1995 | Marco the Phoenix - Whitebeard's "Son" | rr | none |
| 1996 | Vista - Whitebeard's "Son" | rr | none |
| 1997 | Flower Sword Vista - Whitebeard's "Son" | rr | none |
| 2006 | Shanks - Emperor Who Rewards Courage | rr | none |
| 2014 | Rob Lucci - Dark Justice-Abiding Beast | rr | none |
| 2018 | Shanks - Pirate with a Straw Hat | rr | none |
| 2019 | Red-Haired Shanks - Pirate with a Straw Hat | rr | none |
| 2022 | Akainu - Fateful Struggle to the Death | rr | none |
| 2024 | Aokiji - Fateful Struggle to the Death | rr | none |
| 2032 | Monkey D. Luffy - I Can't Eat Any More | rr | none |
| 2033 | Monkey D. Luffy - Gear Four: Tankman | rr | none |
| 2046 | Yasopp - Harbor Town Pirate | rr | none |
| 2049 | Gecko Moria - Nightmare of Shadows | rr | none |
| 2073 | Monkey D. Luffy - Gum-Gum Power's Potential | rr | none |
| 2075 | Nami - Navigator Mapping the World | rr | none |
| 2087 | Monkey D. Luffy - Let's Go to the Pirate Festival! | rr | none |
| 2095 | Nico Robin - Let's Go to the Pirate Festival! | rr | none |
| 2096 | Roronoa Zoro - Swordsman Cutting Through the New World | rr | none |
| 2098 | "Gold Emperor" Gild Tesoro | rr | none |
| 2112 | Charlotte Katakuri | rr | none |
| 2127 | Charlotte Brulee - Brulee's Forces | rr | none |
| 2145 | Rebecca - Beautiful Gladiator Wishing for Power | rr | none |
| 2146 | Rebecca - "The Princess Who Never Was" Aiming for Victory | rr | none |
| 2147 | Vinsmoke Sanji - Germa Kingdom's Sacrifice | rr | none |
| 2157 | Charlotte Cracker | rr | none |
| 2160 | Donquixote Doflamingo - Pirate Warlord of the Sea | rr | none |
| 2176 | The Cat Viper | rr | none |
| 2177 | The Cat Viper - Guardian of the Whale Forest | rr | none |
| 2180 | Whitebeard & Marco - Paramount War Frontline | rr | none |
| 2196 | Blackbeard - Warlord of the Sea | rr | none |
| 2200 | Shiki - Plan to Tear the World Asunder | rr | none |
| 2218 | Duke Dogstorm | rr | none |
| 2219 | Duke Dogstorm - Mokomo Dukedom | rr | none |
| 2233 | Charlotte Linlin - Queen of Totto Land | rr | none |
| 2235 | Soul King Brook - Promise to a Friend | rr | none |
| 2237 | Charlotte Smoothie | rr | none |
| 2239 | Charlotte Perospero | rr | none |
| 2250 | Monkey D. Garp - Pirate King's Arch-Nemesis | rr | none |
| 2264 | Jinbe - Sun Pirates Captain | rr | none |
| 2276 | Buggy - Warlord of the Sea | rr | none |
| 2277 | Buggy the Genius Jester - Warlord of the Sea | rr | none |
| 2280 | Vinsmoke Judge - King of Germa | rr | none |
| 2284 | Hody Jones - The Hatred in the Fish-Man District | rr | none |
| 2298 | Hancock - Sexy Bat: Midnight Halloween Parade | rr | none |
| 2301 | Capone "Gang" Bege - Big Mom Pirate Family Member: Fighter "Rook" | rr | none |
| 2326 | Charlotte Amande - Third Daughter of the Charlotte Family | rr | none |
| 2327 | Charlotte Amande - The Mad Moiselle | rr | none |
| 2329 | Z - Neo Marines Leader | rr | none |
| 2337 | Carrot - Mink Tribe's True Form | rr | none |
| 2355 | Arlong - Tyrannical Fish-Man | rr | none |
| 2361 | Nami - Captivating Lady Santa | rr | none |
| 2364 | Charlotte Katakuri - Serious Battle | rr | none |
| 2366 | Charlotte Flampe | rr | none |
| 2368 | Charlotte Montd'Or | rr | none |
| 2370 | Gourmet Knight Streusen | rr | none |
| 2393 | Portgas D. Ace - Pirate of the Whitebeard Era | rr | none |
| 2395 | Chopper & Franky - Warriors with the Soul of an Emperor | rr | none |
| 2396 | Sanji & Zoro - Warriors with the Soul of an Emperor | rr | none |
| 2397 | Usopp & Robin - Warriors with the Soul of an Emperor | rr | none |
| 2417 | Bartolomeo & Cavendish - Bickering Rebels | rr | none |
| 2419 | Ideo - Two-Time Champion of the New World Central MMA League | rr | none |
| 2421 | Hajrudin - Spear of Elbaph | rr | none |
| 2423 | Elizabello II - King's Fist Smashing a Giant Arm | rr | none |
| 2427 | Cavendish - Beautiful Captain Gathering Popularity | rr | none |
| 2428 | Cavendish - Beautiful Captain Fulfilling the Demands of Fame | rr | none |
| 2430 | Charlotte Pudding - Flip-Flopping Emotions | rr | none |
| 2432 | Jack - Animal Kingdom Pirates, Lead Performer, Captain of the Mammoth | rr | none |
| 2440 | Sabo - Straw Hat Luffy's Brother | rr | none |
| 2445 | Sanji & Judge - Destiny of Father and Son | rr | none |
| 2464 | Charlotte Cracker - General Who Manipulates Biscuit Warriors | rr | none |
| 2472 | Big Mom - Hungry Chase | rr | none |
| 2474 | Dracule Mihawk - Strongest Master in the World | rr | none |
| 2476 | Roronoa Zoro - Strongest Swordsman's Pupil | rr | none |
| 2478 | Mr. 1 - Human Sword Assassin | rr | none |
| 2480 | Hyouzou - Steroid and Booze Junkie | rr | none |
| 2482 | Kaku - CP9's Greatest Swordsman | rr | none |
| 2484 | Ryuma - Zombie General Swordsman | rr | none |
| 2490 | Dr. Hiriluk - Drum Kingdom's Quack Doctor | rr | none |
| 2491 | Dr. Hiriluk - The Quack Doctor's Dream | rr | none |
| 2503 | Capone "Gang" Bege - Castle-Man | rr | none |
| 2516 | Magellan & Hannyabal - Guards of Impel Down | rr | none |
| 2521 | Usopp - Dressing Up for the Pirate Festival! | rr | none |
| 2523 | Sanji - Dressing Up for the Pirate Festival! | rr | none |
| 2524 | Nami - Dressing Up for the Pirate Festival! | rr | none |
| 2533 | Luffy & Law - Those Who Destroy the Facade of Peace | rr | none |
| 2535 | Zeus & Prometheus & Big Mom - Those With Souls on Another Level | rr | none |
| 2537 | Lucci & Kaku - Users of Unimaginable Techniques | rr | none |
| 2539 | Ivankov & Bon Clay - Impel Down's New Kama | rr | none |
| 2541 | Smoker & Tashigi - G-5's Commanders | rr | none |
| 2543 | Mr. 0 & Miss All Sunday - Leaders of Baroque Works | rr | none |
| 2560 | Sabo & Koala - Youthful Revolutionary Power | rr | none |
| 2562 | Lindbergh | rr | none |
| 2564 | Belo Betty | rr | none |
| 2566 | Karasu | rr | none |
| 2576 | Dogstorm & Cat Viper - Clashing Kings | rr | none |
| 2600 | Vivi & Rebecca - Benefactor's Bond | rr | none |
| 2602 | Shirahoshi & Mansherry - Injury's Bond | rr | none |
| 2604 | Navy HQ Captain Coby - Escort to The World Council | rr | none |
| 2606 | Viola - Princess of Dressrosa | rr | none |
| 2608 | Conney - Any Age, Any Time | rr | none |
| 2646 | Foxy & Wapol - The Straw Hats Victims' Support Group | rr | none |
| 2647 | Bartolomeo & Cavendish - The Straw Hats' Defenders | rr | none |
| 2650 | Bullet - Former Member of the Roger Pirates | rr | none |
| 2652 | Tony Tony Chopper - Doctor Scouting Out the Pirates Expo | rr | none |
| 2654 | Nico Robin - Archaeologist Enjoying the Pirates Expo | rr | none |
| 2656 | Brook - Musician Infiltrating the Pirates Expo | rr | none |
| 2671 | Monkey D. Luffy - Shouldering the Hopes of His Crew | rr | none |
| 2673 | Roronoa Zoro - Swordsman Cutting Through the Pirates Expo | rr | none |
| 2675 | Nami - Keen-Eyed Cat Burglar at the Pirates Expo | rr | none |
| 2677 | Franky - Shipwright Exhibiting at the Pirates Expo | rr | none |
| 2679 | Usopp - Sniper Lying at the Pirates Expo | rr | none |
| 2680 | Usopp - ONE PIECE STAMPEDE | rr | none |
| 2683 | Sabo - An Unlikely Alliance | rr | none |
| 2685 | Whitebeard - Great Pirate Who Created an Age | rr | none |
| 2695 | Marco - Blue Flame in the Paramount War | rr | none |
| 2697 | Sir Crocodile - King of the Desert in the Paramount War | rr | none |
| 2699 | Kaido - Supreme Commander of the Animal Kingdom Pirates | rr | none |
| 2701 | Jack - In Control of Kuri | rr | none |
| 2703 | Holdem | rr | none |
| 2705 | Speed | rr | none |
| 2740 | Ace: Flame Wolf - Happy Halloween! | rr | none |
| 2742 | Koala: Devilish Red Riding Hood - Happy Halloween! | rr | none |
| 2744 | Reiju: Bride of Halloween - Happy Halloween! | rr | none |
| 2746 | Doflamingo: Night Walker - Happy Halloween! | rr | none |
| 2773 | Onami | rr | none |
| 2775 | Komurasaki | rr | none |
| 2777 | Okiku | rr | none |
| 2779 | Otama | rr | none |
| 2786 | Chopperemon | rr | none |
| 2788 | Bonekichi | rr | none |
| 2791 | Orobi | rr | none |
| 2796 | Tony Tony Chopper - Long-Awaited Christmas | rr | none |
| 2801 | Luffytaro & Zorojuro - Land of Wano Visitor | rr | none |
| 2803 | Sangoro | rr | none |
| 2805 | Usohachi | rr | none |
| 2807 | Franosuke | rr | none |
| 2809 | Carrot - Ninja-Pirate-Mink-Samurai Alliance | rr | none |
| 2818 | Shanks & Mihawk - Strong Swordsmen's Reunion | rr | none |
| 2834 | Nami & Robin - The Lovely Ladies of the Straw Hat Crew | rr | none |
| 2836 | Charlotte Pudding - Love and Determination | rr | none |
| 2838 | Lady Alvida - The Clown's Partner | rr | none |
| 2840 | Tashigi - Captain's Kindness Towards the Injured | rr | none |
| 2859 | Arlong Pirates - Invaders of the East Blue | rr | none |
| 2861 | Red-Hair Pirates - Pirates Making Merry at the Feast | rr | none |
| 2863 | Krieg & Gin - Survivors From the Grand Line | rr | none |
| 2865 | Klahadore & Django - Secret Assassination Plot | rr | none |
| 2894 | Mihawk & Perona - Residents of the Ruins of the Muggy Kingdom | rr | none |
| 2896 | Silvers Rayleigh - Guidance for a New Era | rr | none |
| 2898 | Emporio Ivankov - The Cook's Many Trials | rr | none |
| 2900 | Heracles - Glinston's Open Air Classroom | rr | none |
| 2902 | Bartholomew Kuma - Rampage on Sabaody Archipelago | rr | none |
| 2929 | Aokiji - Uncompromised Determination and Justice | rumbleRR | none |
| 2935 | Monkey D. Luffy - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2937 | Roronoa Zoro - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2939 | Nami - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2941 | Usopp - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2943 | Sanji - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2945 | Tony Tony Chopper - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2947 | Nico Robin - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2949 | Franky - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2951 | Brook - Straw Hat Pirates: Mark of Adventure | rr | none |
| 2957 | Monkey D. Luffy - Future-Confronting Bullet | rr | none |
| 2959 | Sabo - Brotherly Bond | rr | none |
| 2961 | Charlotte Katakuri - Future-Reading Haki | rr | none |
| 2963 | Marshall D. Teach - Emperor | rr | none |
| 2965 | Boa Hancock - Affection for Straw Hat Luffy | rr | none |
| 2967 | Trafalgar Law - Life's Meaning | rr | none |
| 2969 | Eneru - Merciless Lightning | rr | none |
| 2971 | Donquixote Doflamingo - Soaring Demon | rr | none |
| 2979 | Eustass Kid - Dragon-Challenging Young Captain | rr | none |
| 2981 | Basil Hawkins - Subordinate to the Dragon | rr | none |
| 2983 | Page One | rr | none |
| 2985 | X Drake - Former Drake Pirates | rr | none |
| 3006 | Smoker - Sailor with an Unwavering Sense of Justice | rr | none |
| 3008 | Sugar - Shocked Creator of Toys | rr | none |
| 3010 | Caesar Clown - Gas-Gas Fruit User | rr | none |
| 3012 | Jewelry Bonney - Worst Generation in Hiding | rr | none |
| 3014 | Emporio Ivankov - Engineer of the Human Body | rr | none |
| 3026 | Trafalgar Law - Alliance to Change the Land of Wano | rr | none |
| 3037 | Boa Hancock - Time Off on the Beach | rr | none |
| 3039 | Rebecca - Royal Time Off | rr | none |
| 3041 | Nico Robin - Time Off in the Shade | rr | none |
| 3043 | Viola - Royal Time Off | rr | none |
| 3064 | Luffy & Sanji - One-Sided Duel | rr | none |
| 3066 | Nami - Farewell Slap | rr | none |
| 3068 | Capone Bege - Invitation to the Tea Party | rr | none |
| 3070 | Germa 66 - Science Military | rr | none |
| 3072 | Sweet 3 Generals - Big Mom's Children | rr | none |
| 3099 | Mihawk: Lord of the Night - Happy Spooky Halloween! | rr | none |
| 3101 | Law: Midnight Doctor - Happy Spooky Halloween! | rr | none |
| 3103 | Hancock: Midnight Party - Happy Spooky Halloween! | rr | none |
| 3105 | Buggy: Mischievous Jester - Happy Spooky Halloween! | rr | none |
| 3117 | Shanks: Moon Knight - Happy Spooky Halloween! | rr | none |
| 3134.1 | Kaido | rr | none |
| 3134.2 | Big Mom | rr | none |
| 3136 | King - Animal Kingdom Pirates, Lead Performer | rr | none |
| 3138 | Queen - Animal Kingdom Pirates, Lead Performer | rr | none |
| 3140 | Jack - Animal Kingdom Pirates, Lead Performer | rr | none |
| 3156 | Akainu - Uncompromised Determination and Justice | rumbleRR | none |
| 3163 | Vivi & Rebecca - Joyous Dinner Party | rr | none |
| 3165 | Shirahoshi & Mansherry - Blissful Gift Exchange | rr | none |
| 3167 | Neptune - Santa Claus Getting Ready | rr | none |
| 3169 | Leo - Warrior Anticipating the Party | rr | none |
| 3174 | Kozuki Oden | rr | none |
| 3176 | Gol D. Roger | rr | none |
| 3178 | Dogstorm - Country-Protecting King of the Day | rr | none |
| 3180 | Cat Viper - Country-Protecting King of the Night | rr | none |
| 3182 | Crocus - Lighthouse Keeper | rr | none |
| 3184 | Rayleigh - Old Soldier at the Auction House | rr | none |
| 3203 | Sanji & Pudding - Exciting Collaboration | tmKizuna | none |
| 3224 | Zorojuro - Swordsman Missing a Katana | rr | none |
| 3226 | Kaido - Imposing Emperor | rr | none |
| 3228 | Kamazo | rr | none |
| 3230 | Gyukimaru - Warrior-Monk Waiting for an Opening | rr | none |
| 3244 | Eneru - Kami Who Controls Through Fear | rumbleRR | none |
| 3252.1 | Portgas D. Ace | rr | none |
| 3252.2 | Akainu | rr | none |
| 3254 | Jozu - Diamond Body | rr | none |
| 3256 | Monkey D. Luffy - Rookie Joining the Fray | rr | none |
| 3258 | Aokiji - Navy HQ Admiral's Composure | rr | none |
| 3260 | Sengoku - Last Bastion | rr | none |
| 3277 | Magellan - Terrifying Poison | rr | none |
| 3279 | Marshall D. Teach - Overwhelming Two Powers | rr | none |
| 3281 | Gecko Moria - Return of the Lord of Shadows | rr | none |
| 3299 | Firetank Pirates - Familial Bonds | tmKizuna | none |
| 3306 | Jewelry Bonney - Big Eater Joining the Fray | rr | none |
| 3333 | Monkey D. Luffy - Pirate Within the Storm | super | none |
| 3335 | Trafalgar Law - Pirate Within the Storm | super | none |
| 3337 | Eustass Kid - Pirate Within the Storm | super | none |
| 3348 | Ace & Sabo - Brothers in Kimono | tmKizuna | none |
| 3354.1 | Whitebeard | rr | none |
| 3354.2 | Shanks | rr | none |
| 3356 | Marco - Flame of Passion and Healing | rr | none |
| 3363 | Sanji - MUGIWARA 56 | tmKizuna | none |
| 3375 | King - Soaring Pteranodon | rr | none |
| 3377 | Queen - Super Heavyweight Class Brachiosaurus | rr | none |
| 3390 | Toki & Momonosuke & Hiyori | tmKizuna | none |
| 3402 | Reiju - Summer Night Vacation | rr | none |
| 3404 | Vivi - Summer Night Vacation | rr | none |
| 3410 | Kizaru - A Light Shining Over Absolute Justice | rumbleRR | none |
| 3421 | Rob Lucci - CP-0 on Guard Duty | rr | none |
| 3426 | Bartholomew Kuma - All Repelling Paws | rumbleRR | none |
| 3432 | Ulti & Page One | rr | none |
| 3451 | Hancock: Flirtatious Halloween - Night of Halloween | rr | none |
| 3453 | Perona: Halloween Princess - Night of Halloween | rr | none |
| 3461 | Koala: Halloween Night Party - Night of Halloween | tmKizuna | none |
| 3465 | Dracule Mihawk - Unreachable Strength | rr | none |
| 3471 | Donquixote Doflamingo - Clash of the Color of Conqueror | rr | none |
| 3473 | Charlotte Katakuri - Taking Head-On Against the Mighty Foe | rr | none |
| 3482 | Sir Crocodile - He Who Forgives Everything | tmKizuna | none |
| 3492 | Nami & Usopp - Preparation for a Grand Battle | rr | none |
| 3494 | Robin & Jinbe - Archaeologist and Helmsman | rr | none |
| 3507 | Kaido & Lead Performers - Animal Kingdom Pirates | tmKizuna | none |
| 3512 | Roger & Newgate - Confrontation of the Mighty | super | none |
| 3514 | Luffy & Straw Hat Pirates - Advancing Pirates | super | none |
| 3522 | Mr. 2 Bon Clay - Oh Come My Way in Bloom | tmKizuna | none |
| 3533 | Dogstorm - Sulong Challenging the Dragon | rr | none |
| 3535 | Cat Viper - Sulong Challenging the Dragon | rr | none |
| 3542 | Carrot & Wanda - Beautiful Sulongs | tmKizuna | none |
| 3552 | Kozuki Oden - Samurai Passing On His Will | rr | none |
| 3554 | Kin'emon & Denjiro - Samurai Challenging the Dragon | rr | none |
| 3562 | Izo & Kikunojo - Siblings Avenging Their Liege | tmKizuna | none |
| 3573 | Black Rhino FR-U4 & Brachio-Tank 5 - Rendezvous Point | rr | none |
| 3575 | Brook - Gallant Skeletal Gentleman | rr | none |
| 3581 | Urouge - Fallen Monk Calamity | rumbleRR | none |
| 3589 | Drake - Betting on Hope | tmKizuna | none |
| 3594 | Marco - Phoenix in the Battlefield | rr | none |
| 3596 | Olin the Oiran - In Search of the One Piece | rr | none |
| 3606 | Monkey D. Luffy - With His Loyal Companions | super | none |
| 3608 | Kaido - Dragon Enjoying the Battle | super | none |
| 3610 | Yamato & Ace - Full-Force Clashes | super | none |
| 3612 | Hancock & Nami & Robin - Trio of Beauties | anni | none |
| 3628 | Trafalgar Law - Captain Aiming for the Dragon's Heart | rr | none |
| 3630 | Eustass Kid - Captain After the Dragon's Head | rr | none |
| 3636 | Charlotte Smoothie - Sweet General in Pursuit | rumbleRR | none |
| 3640 | Marshall D. Teach - Boundless Infamy | tmKizuna | none |
| 3649 | Black Maria - Seductive Tobi Roppo | rr | none |
| 3651 | Who's-Who - Obstructing Tobi Roppo | rr | none |
| 3653 | Sasaki - Crashing Tobi Roppo | rr | none |
| 3673 | Ulti - Having Fun at the Summer Festival | rr | none |
| 3675 | Hiyori - Incognito at the Summer Festival | rr | none |
| 3681 | Tony Tony Chopper - Admirable Live Performance | rr | none |
| 3694 | Shanks - Impeding Savior | super | none |
| 3696 | Ben Beckman & Lucky Roux - Leading Officers | rr | none |
| 3705 | Monkey D. Luffy - A Friend's Promise | super | none |
| 3707 | Usopp & Yasopp - Connected Sight | rr | none |
| 3722 | Sengoku - Fleet Admiral Protecting Marineford | rr | none |
| 3729 | Monkey D. Garp - Proud Fist | rumbleRR | none |
| 3734 | Hina - Observing Rear Admiral | tmKizuna | none |
| 3740 | Corazon & Law: Secret Day-Off - Creepy Night Halloween | rr | none |
| 3744 | Kin'emon & Denjiro & Ashura Doji & Dogstorm | anni | none |
| 3751 | Orochi - Begrudging Shogun | rumbleRR | none |
| 3754 | Roronoa Zoro - Menacing Fight | anni | none |
| 3765 | Olin the Oiran - Fresh Thunder Cloud | rr | none |
| 3771 | Page One - Dashing Tobi Roppo | rumbleRR | none |
| 3774 | Jinbe - Fierce Fight with an Ancient Type | tmKizuna | none |
| 3779 | Boa Hancock - Devotion to Her Beloved | tmKizuna | none |
| 3787.1 | Kaido | super | none |
| 3787.2 | Yamato | super | none |
| 3789 | Nami - With a New Right-Hand Soul | super | none |
| 3791 | Nico Robin - Demonio Fleur | super | none |
| 3808 | Edward Newgate - The Landing Great Pirate | rr | none |
| 3810 | Rayleigh & Gaban - The Mighty Duo | rr | none |
| 3823 | Charlotte Perospero - Gleaming Candy Art in the Shroud | tmKizuna | none |
| 3829 | Portgas D. Ace - Captain of the Spade Pirates | anni | none |
| 3831 | Monkey D. Luffy - Boy Chasing His Dream | anni | none |
| 3838 | Sabo - Reunion With His Little Brother | anni | none |
| 3849 | Killer - Offering His Life | rr | none |
| 3851 | Basil Hawkins - Final Straw Doll | rr | none |
| 3858 | Scratchmen Apoo - Music to Energize the Floor | rumbleRR | none |
| 3860 | Jewelry Bonney - Greedy Captain | tmKizuna | none |
| 3869 | Jack - Raging Drought | rr | none |
| 3879 | Oden & Toki - Cherished Meeting | anni | none |
| 3888 | Sanji - Legs to Surpass the Devil | super | none |
| 3890 | Queen - Cyborg Scientist | rr | none |
| 3895 | Roronoa Zoro - Awoken Talent | super | none |
| 3897 | King - Tribe of Flames | rr | none |
| 3904 | Emporio Ivankov - This is the First Time in My Life | rumbleRR | none |
| 3907.1 | Whitebeard | rr | none |
| 3907.2 | Blackbeard | rr | none |
| 3909 | Shanks & Buggy - Meeting at the Paramount War | rr | none |
| 3916 | Doflamingo & Crocodile - Recruiting on the Battlefield | tmKizuna | none |
| 3921 | Robin & Koala - Chats Before Training | rr | none |
| 3923 | Black Maria & Ulti - Obstructing Tobi Roppo Pair | rr | none |
| 3932 | Nami & Carrot - Escaping Into the Seducing Woods | tmKizuna | none |
| 3943 | Vivi & Rebecca & Shirahoshi & Mansherry | rr | none |
| 3947 | Izo - Pinning the Pursuing Foe | rr | none |
| 3953 | Kawamatsu - Determination of a Kozuki Clan Vassal | rumbleRR | none |
| 3955 | Monkey D. Luffy - Awoken Warrior of Liberation | super | none |
| 3958 | Kozuki Momonosuke - Appearance of the Pink Dragon | rr | none |
| 3966 | Vinsmoke Reiju - Second Farewell | tmKizuna | none |
| 3970 | Law & Kid - Awakened Captains | super | none |
| 3972 | Olin the Oiran - Incoming Terror | super | none |
| 3983 | Kaido - Flaming Rising Dragon | super | none |
| 3985 | Kurozumi Kanjuro - Performing the Final Dance | rr | none |
| 3992 | Uta - Fury-Filled Eyes | rr | none |
| 3994 | Kizaru & Fujitora - Incoming Navy HQ Powerhouses | rr | none |
| 4002 | Nami & Carina - Frenemies: Cat and Fox | tmKizuna | none |
| 4007 | Ain - Commencing the Operation | tmKizuna | none |
| 4019 | Katakuri & Oven - Sister Protecting Brothers | rr | none |
| 4028 | Coby - Hero Arriving at Elegia | anni | none |
| 4040 | Kozuki Momonosuke - Pink Dragon Protecting Wano | rr | none |
| 4042 | Kozuki Hiyori - Opening of the Tragic Days | rr | none |
| 4057 | Roger & Oden - Set Sail to the Vast Ocean | super | none |
| 4059 | Yamato - Determined to Fight Alongside the Land of Wano | super | none |
| 4061 | Zoro & Sanji - Vows Made | super | none |
| 4081 | Dr. Vegapunk "Lilith the Evil" | rr | none |
| 4083 | Jewelry Bonney - Girl Jumping Out the Warm Eddy | rr | none |
| 4095 | Boa Hancock - Sealed Powers | rr | none |
| 4099 | Marshall D. Teach - Intervening Emperor | anni | none |
| 4101 | Jesus Burgess - New Found Powers | rr | none |
| 4110 | Buggy & Crocodile & Mihawk | anni | none |
| 4114 | Tobi Roppo - Animal Kingdom Pirates | tmKizuna | none |
| 4121 | Doflamingo & Sugar - Darkness of Dressrosa | rr | none |
| 4123 | Moria & Perona - Nightmare of Thriller Bark | rr | none |
| 4136 | Dr. Vegapunk | tmKizuna | none |
| 4141 | Kid & Killer - Enjoying the Feast | rr | none |
| 4149 | Monkey D. Luffy - Awakened Powers | super | none |
| 4166 | S-Snake | tmKizuna | none |
| 4210.1 | Monkey D. Luffy | super | none |
| 4210.2 | Kaido | super | none |
| 4218.1 | Blackbeard | super | none |
| 4218.2 | Trafalgar Law | super | none |
| 4220 | Kuzan - A Drink to Mend the Wounded Heart | rr | none |
| 4230.1 | Shanks | super | none |
| 4230.2 | Eustass Kid | super | none |
| 4232 | Dorry & Broggy | rr | none |
| 4239 | Monkey D. Garp - Landing on Pirate Island | rr | none |
| 4241 | Prince Grus & Kujaku & Hibari | rr | none |
| 4249 | Coby - Planning to Escape Fullalead | tmKizuna | none |
| 4361 | Nami - Riding the Waver | rr | none |
| 4362 | Monkey D. Luffy - Escape! Impel Down | rr | none |
| 4379 | St. Jaygarcia Saturn | super | none |
| 4440 | St. Shepherd Ju Peter | super | none |
| 4442 | St. Ethanbaron V. Nusjuro | super | none |
| 4450 | St. Topman Warcury | super | none |
| 4452 | St. Marcus Mars | super | none |
| 5013 | Monkey D. Luffy - Kung Fu Training | rr | none |

