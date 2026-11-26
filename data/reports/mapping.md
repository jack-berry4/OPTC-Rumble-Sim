# OPTC-DB <-> game data join

OPTC-DB: 2Shankz/optc-db.github.io@a5689c133722e8ab7f80e02cb4be306e47824fc7 (2026-11-23T23:46:57Z, "Nov EoM Batch PVP Filters")
Game: sakura.db sha256 aa8c0dfb917618c3..., 6803 characters, newest row 2026-11-19T05:03:34.000Z
Built: 2026-11-25T19:05:20.357Z

Rumble units in OPTC-DB: **4678**; joined to a game row: **4653**; not joined: **25**.

| How | Units |
|---|---|
| MstCharacter_.logbookId_ = OPTC-DB id (name or max stats verified) | 4568 |
| same name and max HP/ATK/RCV (Global numbers these differently, logbookId_ 5009+) | 49 |
| VS form x.1 / x.2 = the parent's versusChildCharacterIds_ in order | 36 |

IDs: OPTC-DB id = `logbookId_` (Character Log no.), not `id_` (internal row) and not `serverId_` (assets,
battle captures). Example: Pacifista PX-4 = OPTC-DB 971 = logbookId_ 971, id_ 1094, serverId_ 1199.

## Joined by name + stats (Global logbook number differs)

| OPTC-DB id | Game logbookId_ | serverId_ | Name |
|---|---|---|---|
| 1923 | 5009 | 1934 | Silvers Rayleigh - First Mate of the Roger Pirates |
| 1924 | 5010 | 1935 | Dark King Rayleigh - First Mate of the Roger Pirates |
| 2262 | 5011 | 10249 | Donquixote Doflamingo - Country's Future Hanging by a Thread |
| 2263 | 5012 | 10250 | Donquixote Doflamingo - Plot to Destroy the World |
| 2399 | 5015 | 10498 | Crocodile & Daz - Revived Duo |
| 2440 | 5021 | 10643 | Sabo - Straw Hat Luffy's Brother |
| 2441 | 5022 | 10644 | Sabo - Straw Hat Luffy's Ally |
| 2551 | 5017 | 10640 | Admiral Sengoku & Vice Admiral Garp |
| 2552 | 5018 | 10641 | Admiral Sengoku & Vice Admiral Garp - Dawn of the Great Era of Piracy |
| 2663 | 5019 | 10713 | Roronoa Zoro - Three-Sword Style Swordsman in Chainmail |
| 2664 | 5020 | 10714 | Sanji - First Class Cook in Shining Armor |
| 2685 | 5025 | 10686 | Whitebeard - Great Pirate Who Created an Age |
| 2686 | 5026 | 10687 | Whitebeard - Voiceless Rage |
| 2768 | 5048 | 10258 | Akainu - Admirals in a Fleeting Moment of Calm |
| 2769 | 5049 | 10259 | Sakazuki - Admirals in a Fleeting Moment of Calm |
| 2770 | 5050 | 10262 | Aokiji - Admirals in a Fleeting Moment of Calm |
| 2771 | 5051 | 10263 | Kuzan - Admirals in a Fleeting Moment of Calm |
| 2772 | 5037 | 10993 | Wanda: Kingsbird - Welcoming the Saviors |
| 2784 | 5016 | 10642 | Lucci: Beastman - Absolute Prevention of Evil |
| 2818 | 5023 | 10707 | Shanks & Mihawk - Strong Swordsmen's Reunion |
| 2819 | 5024 | 10708 | Shanks & Mihawk - World's Leading Two Swordsmen |
| 2830 | 5062 | 11165 | Nico Robin - Umbrella Under a Shower of Stars |
| 2909 | 5063 | 11173 | Whitebeard - End of the Long Journey |
| 2919 | 5038 | 10891 | Sanji & Pudding - Royal Matrimony |
| 2929 | 5060 | 11221 | Aokiji - Uncompromised Determination and Justice |
| 2930 | 5061 | 11199 | Kuzan - Uncompromised Determination and Justice |
| 3156 | 5067 | 11400 | Akainu - Uncompromised Determination and Justice |
| 3157 | 5068 | 11338 | Sakazuki - Uncompromised Determination and Justice |
| 3312 | 5027 | 10852 | Monkey D. Garp: Neo |
| 3313 | 5028 | 10853 | Garp the Fist: Neo |
| 3314 | 5033 | 10861 | Emporio Ivankov: Neo |
| 3315 | 5034 | 10862 | Emporio Ivankov: Neo - Queen of Kamabakka Queendom (Retired) |
| 3316 | 5035 | 10994 | Edward Newgate: Neo - Pirate King Rival |
| 3317 | 5036 | 10995 | Edward Newgate: Neo - Great Pirate Whitebeard |
| 3318 | 5039 | 10858 | Iron Mask Duval: Neo |
| 3319 | 5040 | 10859 | Duval: Neo - Flying Fish Riders Leader |
| 3320 | 5041 | 10860 | Duval: Neo - Rosy Life Riders Leader |
| 3321 | 5042 | 10869 | Monkey D. Luffy: Neo - Star of Hope |
| 3322 | 5043 | 10870 | Nightmare Luffy: Neo - Warrior of Hope |
| 3323 | 5044 | 10867 | Bamboo Demon Vergo: Neo |
| 3324 | 5045 | 10868 | Bamboo Demon Vergo: Neo - Top Donquixote Family Officer |
| 3325 | 5057 | 10863 | Heracles-un: Neo |
| 3326 | 5058 | 10864 | Heracles-un: Neo - Hero of the Forest |
| 3327 | 5059 | 11333 | Condoriano |
| 3330 | 5064 | 11286 | Law & Chopper - Dynamic Doctor Duo |
| 3331 | 5052 | 11102 | Usopp & Chopper - Ex-Weakling Duo |
| 3383 | 5065 | 11615 | Local Sea Monster - Man-Eating Monster |
| 3384 | 5053 | 11138 | Sengoku - Fatherly Buddha |
| 3478 | 5066 | 11760 | Makino - Proprietor of a Relaxed Tavern |

## Not joined

| OPTC-DB id | Name | Why |
|---|---|---|
| 519 | Monkey D. Luffy - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1114 (Monkey D. Luffy - Dream Chaser), its Global version |
| 520 | Monkey D. Luffy - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1115 (Monkey D. Luffy - A Pirate Who Lives by His Code), its Global version |
| 521 | Sanji - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1116 (Sanji - Dream Chaser), its Global version |
| 522 | Sanji - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1117 (Sanji - A Pirate Who Lives by His Code), its Global version |
| 523 | Nami - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1118 (Nami - Dream Chaser), its Global version |
| 524 | Nami and Billy the Thunder Bird | not in the Global game data; same stats as OPTC-DB 1119 (Nami - A Pirate Who Lives by Her Code), its Global version |
| 525 | Brook - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1172 (Brook - Dream Chaser), its Global version |
| 526 | Brook - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1173 (Brook - A Pirate Who Lives by His Code), its Global version |
| 527 | Chopper - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1176 (Chopper - Dream Chaser), its Global version |
| 528 | Chopper - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1177 (Chopper - A Pirate Who Lives by His Code), its Global version |
| 553 | Roronoa Zoro - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1174 (Roronoa Zoro - Dream Chaser), its Global version |
| 554 | Roronoa Zoro - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1175 (Roronoa Zoro - A Pirate Who Lives by His Code), its Global version |
| 555 | Usopp - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1209 (Usopp - Dream Chaser), its Global version |
| 556 | Usopp - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1210 (Usopp - A Pirate Who Lives by His Code), its Global version |
| 557 | Nico Robin - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1207 (Nico Robin - Dream Chaser), its Global version |
| 558 | Nico Robin - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1208 (Nico Robin - A Pirate Who Lives by Her Code), its Global version |
| 559 | Franky - Merveille's Adventurer | not in the Global game data; same stats as OPTC-DB 1211 (Franky - Dream Chaser), its Global version |
| 560 | Franky - Straw Hat Pirates' Attack | not in the Global game data; same stats as OPTC-DB 1212 (Franky - A Pirate Who Lives by His Code), its Global version |
| 744 | Portgas D. Ace - Record of the Voyage - Whitebeard Pirates | not in the Global game data (JP-only or not released in Global yet) |
| 745 | Portgas D. Ace - Voyage Dream: Pirate Summit | not in the Global game data (JP-only or not released in Global yet) |
| 801 | Mr. 2 Bon Clay - Voyage Log: B.W. | not in the Global game data (JP-only or not released in Global yet) |
| 802 | Mr. 2 Bon Clay - Voyage Dream: Okama Way | not in the Global game data (JP-only or not released in Global yet) |
| 1009 | Kizuna BOOST Luffy | not in the Global game data; same stats as OPTC-DB 571 (Monkey D. Luffy - Davy Back Fight: Combat), its Global version |
| 1414 | Sanji - Making Food and Drinks | not in the Global game data (JP-only or not released in Global yet) |
| 2494 | Monkey D. Luffy - Delicious Kitchen | not in the Global game data (JP-only or not released in Global yet) |

## Game units with a Rumble special that no OPTC-DB Rumble unit maps to (0)

Usually units OPTC-DB has not added Rumble data for yet (or rows OPTC-DB lists without Rumble data).

