# travel-time

Voice-playable adventure games for the San Francisco → Oregon drive on I-5.

| Item | Location |
|------|----------|
| The Fifth Road GM prompt (mythic) | `game/the-fifth-road-gm-prompt.md` |
| The Dragon Road GM prompt (fantasy RPG) | `game/the-dragon-road-gm-prompt.md` |
| GPS Road Beacon for mobile Safari | `companion/road-beacon.html` |
| Companion hub page (published artifact) | `companion/the-fifth-road.html` |
| Live artifact | https://claude.ai/code/artifact/564639c1-2447-42c3-a3ac-bf5806da14b2 |
| Pages publish script | `scripts/publish-beacon.sh` |

## The scenarios

Both run as Game Master prompts in the Claude mobile app's voice mode, sync to the real drive when the player states a location, and treat the player's EV as a lightning-fed steed. Charging stops trigger dense parked scenes.

- **The Fifth Road** — mythic, literary. The player carries the Ember north on the ley-road under I-5. Start word: "Begin."
- **The Dragon Road** — crunchy fantasy RPG overlay. Classes, voice-called d20s, levels, and loot along a buried dragon's spine. Start word: "Roll for it."

## The Road Beacon

`companion/road-beacon.html` is a standalone page for mobile Safari. It watches GPS, names the current mythic location in either world, and speaks arrivals aloud so the voice-mode GM hears them too. Artifacts cannot access geolocation, so the beacon runs in Safari. For a hosted HTTPS copy, run `bash scripts/publish-beacon.sh` (creates a public GitHub repo and enables Pages).

## How to play

1. Open the companion page and copy the Game Master prompt.
2. Paste it into a new Claude chat on the phone (Sonnet or better).
3. Switch to voice mode and say "Begin."
