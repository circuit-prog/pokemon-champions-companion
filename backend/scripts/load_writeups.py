"""Load hand-written Smogon-style meta analyses for the current top 20
Pokemon by tracked usage into the pokemon_writeups table (Phase 5 of the
roadmap). One-time content, not scraped - written by hand from the real
tracked usage data already in the DB (items/abilities/moves/spreads/
teammates, pulled via GET /api/pokemon/<name>/usage before writing this)
plus general competitive reasoning. Safe to rerun - overwrites by design,
same as any other "this is authored content" loader in this repo.

Usage:
    backend/venv/bin/python backend/scripts/load_writeups.py
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import PokemonWriteup

WRITEUPS = {
    "kingambit": {
        "overview": (
            "The single most-used Pokemon in the format by a wide margin (47% usage). Defiant turns any attempt to "
            "Intimidate or otherwise lower its Attack into a free +2, and at 550 BST with a real physical movepool "
            "it doesn't need the boost to already be threatening. It's the default answer to 'what goes on my team' "
            "in Champions right now, and most teams are built assuming it's coming."
        ),
        "moveset_notes": (
            "Sucker Punch and Kowtow Cleave are almost universal - priority that punishes anything slower trying to "
            "revenge kill it, plus a Fighting-type Sacred Sword clone that ignores stat drops and hits Steel-types "
            "for neutral instead of resisted. Chople Berry is the most common item, softening the Fighting-type "
            "hits Kingambit is otherwise weak to (fitting, since it's usually the thing baiting them out); Black "
            "Glasses and Life Orb trade that safety for a real damage boost once Chople's one-time use isn't "
            "needed. Adamant with a bulky-ish 32 HP / 32 Atk spread (66-point budget, EVs count double) is standard "
            "- Kingambit doesn't need Speed investment since Sucker Punch does the outspeeding for it."
        ),
        "usage_tips": (
            "Bringing it in on an expected Intimidate or other Attack-lowering move is actively good, not something "
            "to avoid - Defiant turns that drop into a free +2 Attack the instant it lands, so switching Kingambit "
            "into a known Intimidate user is a legitimate way to get the boost for free. What it does want to avoid "
            "is a phazing move (Roar/Whirlwind/Dragon Tail) landing right after that boost, since that forces it out "
            "and wastes the tempo Defiant just bought. Sucker Punch only works on a predicted attack, so mix in "
            "Kowtow Cleave/Iron Head against Protect-happy or switch-heavy opponents rather than locking into Sucker "
            "Punch every turn. Swords Dance sets exist but are rarer - most tracked sets forgo it since Kingambit is "
            "threatening enough on raw stats plus Defiant procs."
        ),
        "checks_and_counters": (
            "Fast special attackers that never touch its physical bulk (Charizard Mega Y, Delphox Mega) go over the "
            "top of it cleanly. Ghost-types are immune to Kowtow Cleave's Fighting typing and wall it outright - but "
            "they're actually weak to Sucker Punch (Dark-type moves are super effective against Ghost), so they're "
            "far from a full answer to the set. Fairy-types are the real resist to Sucker Punch, at the cost of "
            "taking Kowtow Cleave/Iron Head for neutral or worse. Anything that can out-prioritize or flinch it "
            "before it acts (Fake Out into a KO) skips the "
            "Sucker Punch mind game entirely. Sneasler and Basculegion - both extremely common teammates for it - "
            "are just as often the answer on the opposing side, since a faster, harder-hitting attacker beats "
            "Kingambit before Defiant becomes relevant."
        ),
    },
    "incineroar": {
        "overview": (
            "The format's premier support pivot. Intimidate softens every physical attacker on the field the moment "
            "it switches in, and Parting Shot lets it pass that momentum straight to a teammate at full HP - a "
            "double-support tool that's hard to replace, which is why it's the #2 most-used Pokemon despite modest "
            "raw offensive stats."
        ),
        "moveset_notes": (
            "Fake Out plus Parting Shot is the core - flinch a target for free damage/tempo, then pivot into "
            "whatever wants the safe entry. Flare Blitz and Darkest Lariat give it teeth so it isn't purely passive, "
            "and Throat Chop shuts down the opposing Fake Out/Trick Room/support-move users it often trades with. "
            "Bulky Impish spreads (32 HP / 20 Def / 12 SpD is a common split of the 66-point budget) are standard "
            "since Incineroar's job is surviving hits and acting again, not outright winning 1v1s."
        ),
        "usage_tips": (
            "Fake Out is a once-per-switch-in resource - use it on the turn it matters (breaking a Focus Sash, "
            "denying a Trick Room setup turn) rather than reflexively on turn one. Parting Shot is most valuable "
            "when the incoming teammate genuinely needs the -Atk/-SpA debuff cover, not just as a generic pivot; "
            "against a team with nothing threatening to switch into, Flare Blitz or Darkest Lariat for real damage "
            "is often better than passing turns away."
        ),
        "checks_and_counters": (
            "Intimidate-immune or Intimidate-punishing abilities (Defiant Kingambit, Clear Body/Own Tempo users) "
            "shrug off its main gimmick entirely. Bulky Water- and Rock-types (both resist Fire) eat Flare Blitz "
            "comfortably and don't fear the recoil trade - Ground-types don't get the same free pass, since Fire "
            "hits them for neutral damage rather than resisted. Since Incineroar rarely one-shots anything, a "
            "Pokemon that can simply "
            "tank a hit and threaten back - Sinistcha and Kingambit both fit, and both are common teammates FOR "
            "Incineroar rather than answers to it - punishes a team leaning too hard on Incineroar for offense."
        ),
    },
    "garchomp": {
        "overview": (
            "A fast, hard-hitting Dragon/Ground with genuinely flexible set options - Choice Scarf for a speed "
            "control answer, Life Orb for a wallbreaker, Sitrus Berry for a bulkier all-rounder. Rough Skin punishes "
            "contact switch-ins for free chip, and STAB Earthquake/Dragon Claw is close to unresisted in this meta's "
            "top tier."
        ),
        "moveset_notes": (
            "Dragon Claw and Earthquake are the STAB core almost every set runs; Rock Slide covers the Flying-types "
            "and Charizard forms that would otherwise wall it, and Stomping Tantrum gives a hard-hitting Ground "
            "option that gets a bonus if the previous move (often Earthquake into a Protect) missed or was blocked. "
            "Jolly with a near-maximal 32 Atk / 32 Spe spread (2 HP filling the rest of the 66-point budget) is the "
            "standard damage-maximizing line, though Choice Scarf sets favor the same spread for the extra speed "
            "tier it unlocks."
        ),
        "usage_tips": (
            "Choice Scarf Garchomp is primarily a speed-control/cleanup tool - use it to outrun things that would "
            "otherwise threaten a slower teammate, not as the primary wallbreaker. Life Orb sets should respect the "
            "recoil - Garchomp folds to priority and its own residual damage faster than its bulk stats suggest. "
            "Rough Skin means a physical attacker that switches into it takes chip for free, so it can profitably "
            "'tank' an unboosted hit it would otherwise just trade with."
        ),
        "checks_and_counters": (
            "Ice-type coverage (even a single Ice-type move on an otherwise unrelated Pokemon) threatens a 4x "
            "weakness. Fairy-types wall the Dragon STAB entirely and don't fear Earthquake if they're not also "
            "Steel or Poison. Sturdy/Sitrus-Berry-into-priority strategies can punish its lack of natural bulk once "
            "the first hit connects. Its most common teammates - Charizard Mega Y, Kingambit, Whimsicott - all cover "
            "different weaknesses (Ice/Fairy respectively), which is exactly why they're paired with it so often."
        ),
    },
    "basculegion-male": {
        "overview": (
            "A revenge-killer built around Last Respects, whose power scales with every fainted Pokemon on its "
            "side - by the time a couple of teammates are down, it's hitting as hard as almost anything in the tier. "
            "Adaptability turns its same-type moves (including Last Respects itself) into effectively 2x STAB "
            "instead of the usual 1.5x."
        ),
        "moveset_notes": (
            "Last Respects is the whole point of the set and scales the longer a game goes; Aqua Jet and Wave Crash "
            "give real STAB options that don't depend on fainted teammates for a fast, hard-hitting attack from turn "
            "one. Choice Scarf is the most common item for pure speed control, though Life Orb sets trade the lock-in "
            "for move flexibility. Jolly 32 Atk / 32 Spe (2 HP filling the budget) is standard - Basculegion wants to "
            "outrun as much of the tier as possible before Last Respects even ramps up."
        ),
        "usage_tips": (
            "Its power is directly tied to your own team's fainted count, so it's a mid-to-late-game payoff more "
            "than an early-game threat - don't force it in turn one expecting full Last Respects damage. Aqua Jet "
            "gives it a priority option once Last Respects has done its job and the game state has shifted toward "
            "cleanup rather than a single big hit."
        ),
        "checks_and_counters": (
            "Bulky Water-resists or anything faster with priority can pick it off before Last Respects scales up "
            "meaningfully. Since its damage output depends on your own team taking losses, stalling out the early "
            "game and denying easy KOs on your side directly weakens Basculegion's payoff later. It's frequently "
            "paired with Kingambit and Whimsicott, both of which help control the tempo of the game so Basculegion "
            "comes in on its own terms rather than being forced out early."
        ),
    },
    "sneasler": {
        "overview": (
            "One of the fastest true breakers in the format once Unburden triggers - losing its held item (most "
            "often a Focus Sash after tanking a hit) doubles its Speed outright, turning an already-fast Pokemon "
            "into something that outruns almost the entire tier."
        ),
        "moveset_notes": (
            "Close Combat and Dire Claw form the offensive STAB core, with Poison Jab as a secondary option and Fake "
            "Out for a guaranteed chip/flinch on the way in. Focus Sash is the standard Unburden enabler - survive "
            "a hit at 1 HP, then double Speed on the next turn; White Herb is the alternative, clearing the Close "
            "Combat stat drops instead. Jolly 32 Atk / 32 Spe (2 HP filling the budget) is standard, same shape as "
            "most fast physical attackers in this meta."
        ),
        "usage_tips": (
            "The Focus Sash/Unburden line only works once per game and only if the Sash actually breaks from a hit "
            "rather than entry hazards or multi-hit moves shredding it before you want it gone - be deliberate about "
            "when you let that first hit land. Close Combat's Defense/Special Defense drops are real and stack fast "
            "if you're forced to click it repeatedly, so switching Sneasler out after a Close Combat rather than "
            "trying to sweep through several Pokemon in a row is often correct."
        ),
        "checks_and_counters": (
            "Anything already faster before Unburden triggers, or a revenge-killer with priority, beats it to the "
            "punch before the Speed boost matters. Multi-hit moves and entry hazards can break its Focus Sash on the "
            "wrong turn, denying the Unburden payoff entirely. Since it's frequently paired with Kingambit and "
            "Incineroar for support, a team that can pressure those partners first often forces Sneasler to act "
            "without the setup it wants."
        ),
    },
    "charizard-mega-y": {
        "overview": (
            "A Drought-powered special attacker that turns on Sun the moment it Mega Evolves, boosting its own Fire-"
            "type moves and enabling teammates that want the weather too (Chlorophyll users, Solar Beam abusers). "
            "It's the most common Mega in the format by a clear margin among Megas."
        ),
        "moveset_notes": (
            "Heat Wave and Weather Ball (which becomes Fire-type and gets a further boost under its own Sun) form "
            "the STAB core; Solar Beam skips its usual charge turn entirely under Sun, giving Charizard a way to hit "
            "Water/Ground/Rock-types that would otherwise trouble a pure Fire-type. Modest with 32 HP / 32 SpA is "
            "the standard spread - Charizard Mega Y has no other stat worth investing in once it commits to being a "
            "special attacker."
        ),
        "usage_tips": (
            "Bring it in proactively rather than reactively where possible - the Sun it sets up is a team-wide "
            "resource, so the earlier your Chlorophyll/Solar Beam teammates get to use it, the more value the whole "
            "team gets. Weather Ball's typing changes with the active weather, so be aware an opposing weather "
            "setter can turn it into a much weaker move if they establish their own weather afterward."
        ),
        "checks_and_counters": (
            "Water- and Rock-types resist its Fire STAB, but that's exactly what Solar Beam is there to punish - "
            "both are weak to Grass, so a Water- or Rock-type sitting in expecting to tank Heat Wave can eat a "
            "Sun-boosted Solar Beam for a lot more than it bargained for instead. The real answers are things that "
            "resist Fire AND aren't Water/Ground/Rock (a bulky Dragon-type, for instance), or opposing weather "
            "setters (Drizzle Pelipper, Sand/Snow setters), which directly undercut its entire gameplan by "
            "overwriting the Sun mid-game. It's most often paired with Garchomp and Whimsicott, who help cover "
            "whatever it can't threaten directly."
        ),
    },
    "sinistcha": {
        "overview": (
            "A bulky special support Pokemon built around Matcha Gotcha (a Grass-type move that also heals "
            "Sinistcha for a portion of the damage dealt) and Trick Room, giving slow, hard-hitting teammates a "
            "window to act first. Hospitality heals a switched-in ally on entry, extending team longevity further."
        ),
        "moveset_notes": (
            "Matcha Gotcha plus Rage Powder (redirecting attacks onto itself) lets Sinistcha tank hits meant for a "
            "teammate while healing off the damage from its own attack. Trick Room support and Life Dew for pure "
            "team healing round out the common set, with Shadow Ball as coverage. Bold spreads splitting the "
            "66-point budget between HP and both defenses (32 HP / 14 Def / 20 SpD is a common split) reflect its "
            "role as a durable pivot rather than a wallbreaker."
        ),
        "usage_tips": (
            "Rage Powder only redirects non-Grass-type moves and doesn't work on Overcoat/Safety Goggles holders or "
            "Grass-types, so it isn't a universal shield - check what's actually being redirected before committing "
            "a teammate's turn around it. Trick Room is most valuable when your team's slow, hard-hitting Pokemon "
            "(Trick Room abusers like Farigiraf are common teammates) are still healthy enough to capitalize on the "
            "turn order flip."
        ),
        "checks_and_counters": (
            "Fire- and Poison-types resist Matcha Gotcha and don't fear its healing-back gimmick as much, since "
            "they can often out-damage what Sinistcha heals. Anything that ignores or is immune to Rage Powder "
            "redirection (Grass-types, Overcoat holders) can freely target the teammate Sinistcha is trying to "
            "protect. It's most often teamed with Incineroar and Sneasler, both of which appreciate Sinistcha "
            "absorbing hits meant for them."
        ),
    },
    "whimsicott": {
        "overview": (
            "A Prankster support Pokemon that gets priority on Tailwind, Encore, and screens - turning speed control "
            "and disruption into something that happens before the opponent can react. Its own damage output is "
            "secondary to what it enables for the rest of the team."
        ),
        "moveset_notes": (
            "Tailwind under Prankster is the headline tool - a team-wide Speed doubling that goes off before almost "
            "anything else can respond. Encore locks a slower or setup-focused opponent into a move that no longer "
            "helps them, and Light Screen adds a damage-reduction layer on top. Timid 32 SpA / 32 Spe is standard "
            "even though Moonblast is often a secondary tool rather than the main plan - the Speed still matters for "
            "positioning even with Prankster covering the support moves."
        ),
        "usage_tips": (
            "Tailwind only lasts a few turns, so time it for when your team is ready to capitalize immediately - "
            "using it a turn too early wastes half its duration on setup rather than offense. Encore is most "
            "devastating against a Pokemon that just used a setup or status move, locking them into repeating "
            "something useless rather than acting freely next turn. Focus Sash is the standard item since "
            "Whimsicott's own bulk is low and it wants to guarantee getting its support move off even after taking "
            "a hit."
        ),
        "checks_and_counters": (
            "Taunt users that move before Whimsicott shut down its entire support gameplan before it does anything. "
            "Dark-types are immune to Prankster-boosted status moves that target them directly, which hard-walls "
            "Encore specifically - but that immunity doesn't touch Tailwind or Light Screen, since those affect "
            "Whimsicott's own side of the field rather than the opponent, so a Dark-type on the field doesn't stop "
            "the speed control or damage reduction at all. It's most often paired with Basculegion and Garchomp, "
            "both of which directly benefit from the Tailwind speed boost it provides."
        ),
    },
    "farigiraf": {
        "overview": (
            "A slow special attacker and Trick Room setter that doubles as a support hub - Helping Hand boosts a "
            "teammate's damage, and Cud Chew lets it re-trigger a berry's effect later in the battle for extra "
            "value from a single item."
        ),
        "moveset_notes": (
            "Trick Room flips the turn order in its own favor given how slow it naturally is, and Psychic/Thunderbolt "
            "provide the special damage once that window opens. Helping Hand is a pure support pick, boosting "
            "whichever teammate needs the extra push to secure a KO. Calm spreads splitting HP and both defenses "
            "(29 HP / 21 Def / 16 SpD in the tracked spread) reflect a bulky support role rather than an all-out "
            "attacker."
        ),
        "usage_tips": (
            "Trick Room is a team-building commitment - it's most valuable alongside genuinely slow, hard-hitting "
            "partners (Sinistcha and other Trick Room abusers are common teammates) rather than as a standalone "
            "gimmick. Helping Hand only helps the ally acting the same turn, so positioning who's about to attack "
            "before clicking it matters more than the raw stat says."
        ),
        "checks_and_counters": (
            "Anything that can remove Trick Room early (a faster Taunt user, or simply outlasting the limited "
            "duration) undercuts its whole plan and leaves it slow with mediocre raw offense. Dark-types resist "
            "Psychic outright and don't fear a Trick-Room-less Farigiraf much at all. It's frequently teamed with "
            "Kingambit and Sylveon, both of which can operate independently of whether Trick Room is up."
        ),
    },
    "sylveon": {
        "overview": (
            "A Pixilate-boosted special attacker whose Normal-type moves become Fairy-type and get a further power "
            "boost, turning Hyper Voice into a hard-hitting, spread-capable STAB move with no real recoil or "
            "drawback."
        ),
        "moveset_notes": (
            "Hyper Voice under Pixilate is the primary STAB, with Hyper Beam as a heavier hit that costs a recharge "
            "turn and Quick Attack (also Fairy-typed under Pixilate) providing a priority option. Fairy Feather is a "
            "held item that further boosts Fairy-type moves specifically, stacking with the Pixilate conversion. The "
            "tracked spread splits investment across HP/Def/SpA/Spe rather than committing fully to one stat, "
            "reflecting a bulkier special attacker role than an all-in sweeper."
        ),
        "usage_tips": (
            "Hyper Beam's recharge turn is a real cost - use it when you can afford to be locked out of acting next "
            "turn, not as a default option over Hyper Voice. Yawn sets exist for a slower support role, forcing a "
            "switch or a sleep turn on the opponent rather than attacking directly."
        ),
        "checks_and_counters": (
            "Steel-types resist Fairy-type moves outright and shrug off Pixilate-boosted Hyper Voice comfortably. "
            "Poison-types similarly resist the Fairy typing. It's most often paired with Kingambit and Garchomp, "
            "neither of which minds trading with the Steel/Poison-types that wall Sylveon specifically."
        ),
    },
    "floette-mega": {
        "overview": (
            "A Fairy Aura special attacker that boosts every Fairy-type move on the field once Mega Evolved "
            "(including the opponent's, a real double-edged consideration), paired with Calm Mind to scale its own "
            "Special Attack and bulk over the course of a game."
        ),
        "moveset_notes": (
            "Dazzling Gleam and Moonblast are the STAB core, both boosted further by its own Fairy Aura; Light of "
            "Ruin is a heavier-hitting option with recoil for when raw power matters more than sustainability, and "
            "Calm Mind lets it set up if given a safe turn. Timid 32 SpA / 32 Spe is standard for a special sweeper "
            "wanting to outrun as much as possible."
        ),
        "usage_tips": (
            "Fairy Aura boosts Fairy-type moves for BOTH sides, so check whether the opponent has their own Fairy "
            "attacker before Mega Evolving carelessly - it can backfire. Calm Mind sets want a genuinely safe "
            "switch-in turn (behind a teammate's redirection or against a passive opponent) since Floette itself "
            "isn't especially bulky before the boosts stack up."
        ),
        "checks_and_counters": (
            "Steel- and Poison-types resist Fairy-type moves and don't fear the Aura boost as much as a neutral "
            "target would. Anything that can pressure it before Calm Mind gets multiple turns to stack punishes the "
            "setup plan directly. It's commonly paired with Kingambit and Basculegion, both of which threaten the "
            "Steel-types that would otherwise wall it."
        ),
    },
    "staraptor-mega": {
        "overview": (
            "A Contrary-boosted physical attacker where its own stat-lowering moves become stat boosts instead - "
            "Close Combat's usual Defense/SpDef drops turn into +1/+1, making it hit progressively harder the more "
            "it attacks rather than wearing itself down."
        ),
        "moveset_notes": (
            "Close Combat is the headline move specifically because of the Contrary interaction, paired with Brave "
            "Bird and Dual Wingbeat for STAB that doesn't rely on the Contrary gimmick at all. Tailwind gives it a "
            "support option for team-wide speed control on top of its own offense, and Roost provides sustain "
            "between attacks. Jolly with heavy Speed investment (32 Spe) plus some bulk (29 HP) is the tracked "
            "spread, prioritizing outrunning threats over raw power."
        ),
        "usage_tips": (
            "Repeated Close Combats stack Attack and Defense boosts fast under Contrary - staying in and attacking "
            "again is usually correct once the boosts start, rather than switching out and losing the stacked stats. "
            "Brave Bird's recoil is a real cost on a Pokemon that wants to stay in and keep attacking, so favor "
            "Close Combat/Dual Wingbeat when the fight is expected to go several turns."
        ),
        "checks_and_counters": (
            "Fighting- and Flying-resistant Pokemon that can also pressure it before the Contrary boosts stack "
            "meaningfully limit its long-term payoff. Anything faster with a way to burst it down in one hit denies "
            "the multi-turn stacking plan entirely. It's frequently paired with Kingambit and Farigiraf, both of "
            "which help create the safe openings Staraptor needs to start stacking boosts."
        ),
    },
    "delphox-mega": {
        "overview": (
            "A Levitate-enabled special attacker that gains full Ground-type immunity on top of a strong special "
            "movepool, letting it switch into Earthquakes and Spikes-heavy teams that would otherwise threaten most "
            "Fire-types."
        ),
        "moveset_notes": (
            "Heat Wave and Psychic/Psyshock form the two-pronged STAB coverage, with Nasty Plot as a setup option "
            "for when it finds a safe turn and Substitute for chip-damage avoidance while it sets up. Timid with "
            "some defensive investment (19 Def in the tracked spread alongside 32 Speed) reflects a special attacker "
            "that still wants to survive a hit or two rather than being purely glass."
        ),
        "usage_tips": (
            "Levitate is a full-time Ground immunity, not situational - it's safe to switch Delphox Mega directly "
            "into an expected Earthquake or entry hazard-laying turn. Nasty Plot is most rewarding against slower, "
            "less immediately threatening opponents; against faster attackers, using its two STABs directly for "
            "damage is usually safer than committing a turn to setup."
        ),
        "checks_and_counters": (
            "Bulky Water-, Rock-, and Dark-types that resist its STAB combination and don't fear a boosted hit wall "
            "it comfortably. Fast, hard-hitting special attackers can outpace it before Nasty Plot pays off. It's "
            "commonly teamed with Kingambit and Sinistcha, both of which cover the physical pressure Delphox Mega "
            "itself doesn't handle well."
        ),
    },
    "raichu-mega-y": {
        "overview": (
            "A No Guard special attacker whose defining trait is that every move - its own and the opponent's - "
            "always hits. Zap Cannon (normally a low-accuracy, high-power move with a guaranteed paralysis chance) "
            "becomes a fully reliable STAB under that ability."
        ),
        "moveset_notes": (
            "Zap Cannon is the entire point of the set - full accuracy plus a 100% paralysis chance on anything it "
            "hits, since No Guard removes the move's usual unreliability. Focus Blast gets the same full-accuracy "
            "treatment for coverage, and Fake Out guarantees the flinch it's normally never certain to land. Timid "
            "with heavy bulk investment (30 HP alongside 23 Speed in the tracked spread) reflects a support-leaning "
            "special attacker rather than a pure sweeper."
        ),
        "usage_tips": (
            "No Guard cuts both ways - the opponent's moves against Raichu also can't miss, so it isn't a "
            "durability tool, purely an offensive/accuracy one. Zap Cannon's paralysis is guaranteed on hit, making "
            "it a strong first move into a fast threat specifically to cripple their Speed for the rest of the game."
        ),
        "checks_and_counters": (
            "Ground-types are immune to its Electric STAB entirely and don't fear Focus Blast if they resist "
            "Fighting too. Since No Guard removes its own evasion as a factor, a hard-hitting attacker that can "
            "simply out-damage it in one hit bypasses the accuracy gimmick completely. It's often paired with "
            "Sylveon and Farigiraf, both of which appreciate a paralyzed target when they're slower attackers "
            "themselves."
        ),
    },
    "blastoise-mega": {
        "overview": (
            "A Mega Launcher special attacker that boosts pulse-type moves, paired with Shell Smash for a full "
            "stat-boosting setup sweep - offense, Special Attack, and Speed all jump at once at the cost of some "
            "bulk."
        ),
        "moveset_notes": (
            "Shell Smash into Water Spout (full power while at full HP) or Dark Pulse/Aura Sphere (boosted by Mega "
            "Launcher) is the core sweep pattern. Fake Out provides a way to get a free turn of chip before "
            "committing to the setup line. Modest 32 SpA / 32 Spe is standard for a setup sweeper wanting to "
            "maximize both damage and the Speed tier it reaches post-Shell Smash."
        ),
        "usage_tips": (
            "Water Spout's power is tied to current HP percentage, so it's strongest as the very first move after "
            "Mega Evolving and weakest after taking any chip damage - sequence around that if possible. Shell Smash "
            "lowers Defense and Special Defense as the tradeoff for the Attack/SpA/Speed boosts, so it needs a "
            "genuinely safe turn (behind a teammate's redirection, or against a passive opponent) rather than being "
            "used reactively under pressure."
        ),
        "checks_and_counters": (
            "Anything faster that can pressure it before Shell Smash goes off denies the setup outright. Once "
            "boosted, priority moves or Pokemon that already outspeed it are the main answer, since its defenses "
            "drop from the Shell Smash trade. It's frequently teamed with Sneasler and Sinistcha, both of which can "
            "help clear the way for a safe Shell Smash turn."
        ),
    },
    "archaludon": {
        "overview": (
            "A bulky Steel/Dragon special attacker whose Sturdy ability guarantees it survives an OHKO from full HP "
            "(when not already using Stamina), and whose Stamina ability instead raises Defense every time it's hit "
            "- making it awkward to break through either way."
        ),
        "moveset_notes": (
            "Electro Shot and Flash Cannon form the STAB core, with Dragon Pulse/Draco Meteor as heavier Dragon-type "
            "coverage for a bigger one-time hit. Leftovers is the most common item for long-term sustain, fitting "
            "its role as a durable special wall/attacker rather than a fast breaker. Bold spreads splitting HP and "
            "Special Defense heavily (32 HP / 29 SpD in the tracked spread) lean into that bulky role."
        ),
        "usage_tips": (
            "Stamina rewards staying in and absorbing hits rather than switching out reactively - each hit taken "
            "raises Defense, so a slow accumulation of bulk over several turns is part of the intended plan, not a "
            "sign to retreat. Electro Shot's boosted power under Rain (Pelipper is a very common teammate) makes "
            "pairing the two a real synergy rather than a coincidence."
        ),
        "checks_and_counters": (
            "Ground-types resist or are immune to its Electric STAB and don't fear Flash Cannon if they're not also "
            "Fairy or Ice. Strong special attackers that can punch through its Special Defense investment before "
            "Stamina stacks meaningfully still threaten it despite the bulk. It's commonly paired with Pelipper and "
            "Swampert Mega, both of which cover the Ground-type answers that would otherwise trouble it."
        ),
    },
    "venusaur": {
        "overview": (
            "A Chlorophyll-enabled special attacker that doubles its Speed under Sun (commonly provided by a "
            "Charizard Mega Y teammate), turning an otherwise slow Grass-type into something that can outrun much "
            "of the tier for as long as the weather lasts."
        ),
        "moveset_notes": (
            "Leaf Storm and Solar Beam (instant under Sun) form the Grass STAB, with Sludge Bomb and Earth Power "
            "rounding out coverage against the Fairy- and Steel-types that would otherwise wall a pure Grass "
            "attacker. Sleep Powder gives it a way to disable a problem Pokemon outright. Modest 32 SpA / 32 Spe is "
            "standard, built entirely around the Chlorophyll Speed-doubling payoff."
        ),
        "usage_tips": (
            "Its Speed advantage only exists while Sun is active, so it's most dangerous in the same turns a "
            "Charizard Mega Y teammate has just set the weather - don't sit on it expecting the Speed boost to last "
            "indefinitely. Leaf Storm's Special Attack drop after use is a real cost; Solar Beam or Sludge Bomb are "
            "safer follow-ups once that drop has happened."
        ),
        "checks_and_counters": (
            "Fire- and Flying-types resist Grass-type STAB and don't fear a Sun-less Venusaur much at all once the "
            "weather runs out or is overwritten. Opposing weather setters directly remove its entire Speed-doubling "
            "gameplan. It's most often paired with Charizard Mega Y and Incineroar, the former providing the Sun it "
            "depends on."
        ),
    },
    "pelipper": {
        "overview": (
            "The format's primary Rain setter - Drizzle turns on Rain the moment it switches in, boosting its own "
            "Water-type moves and enabling any Swift Swim or Rain-abusing teammate (Archaludon's Electro Shot "
            "included) for the rest of the turn count."
        ),
        "moveset_notes": (
            "Hurricane (guaranteed accuracy under its own Rain) and Weather Ball (Water-typed and boosted under "
            "Rain) form the STAB options, with Tailwind and Wide Guard as support tools for the team built around "
            "it. Timid 32 SpA / 32 Spe is the standard spread, though many sets lean more supportive than "
            "damage-focused given how much of its value is the weather itself."
        ),
        "usage_tips": (
            "Bring it in as early as reasonably possible - Rain is a team-wide resource, and the sooner it's up, "
            "the more turns your Swift Swim/Rain-boosted teammates get to use it. Hurricane's accuracy is only "
            "guaranteed while Rain is active, so be aware of how many turns of weather remain before relying on it "
            "against a Sun or Sand team that could overwrite the field."
        ),
        "checks_and_counters": (
            "Opposing weather setters (Charizard Mega Y's Drought especially) directly undo its entire gameplan the "
            "moment they switch in. Electric-type attacks are a real threat rather than something it resists - "
            "Water/Flying is a clean 4x weakness to Electric, so an Electric-type attacker is one of the most "
            "efficient ways to remove it. Grass-type attackers resist its Water STAB outright, if not the more "
            "pressing concern. It's frequently paired with Archaludon and Swampert Mega, both of which directly "
            "benefit from the Rain it provides."
        ),
    },
    "froslass-mega": {
        "overview": (
            "A Snow Warning setter that also functions as a genuine special attacker, using Aurora Veil (which "
            "requires Hail/Snow to use at all) to give its whole team a damage-reduction screen on both sides "
            "simultaneously."
        ),
        "moveset_notes": (
            "Blizzard (full accuracy under its own Snow) and Shadow Ball form the STAB core, with Aurora Veil as the "
            "signature support tool and Taunt to stop slower setup Pokemon before they act. Modest with heavy Speed "
            "investment (32 Spe alongside 20 SpA in the tracked spread) balances damage output with the Speed to "
            "get Aurora Veil up before the opponent can punish the setup turn."
        ),
        "usage_tips": (
            "Aurora Veil needs the Snow/Hail already active, so sequencing matters - Snow Warning triggers "
            "automatically on switch-in, meaning Aurora Veil can be used the very same turn Froslass Mega enters, "
            "unlike Light Screen/Reflect which need no such precondition but also don't get the same one-move "
            "dual-screen efficiency. Blizzard's full accuracy is conditional on the weather actually still being "
            "active, so track how many turns of Snow remain."
        ),
        "checks_and_counters": (
            "Opposing weather setters overwrite its Snow and remove both the Blizzard accuracy guarantee and the "
            "ability to reapply Aurora Veil later. Steel- and Fire-types resist its Ice-type STAB. It's commonly "
            "paired with Sneasler and Kingambit, both of which benefit from the Aurora Veil damage reduction while "
            "applying their own pressure."
        ),
    },
    "aerodactyl-mega": {
        "overview": (
            "A Tough Claws physical attacker where every contact move gets a further power boost on top of STAB, "
            "combined with genuinely high natural Speed - making it one of the hardest-hitting fast attackers in "
            "the format when it connects."
        ),
        "moveset_notes": (
            "Rock Slide and Dual Wingbeat form the STAB core, both boosted by Tough Claws since they make contact; "
            "Ice Fang rounds out coverage against the Dragon- and Grass-types that would otherwise trouble a Rock/"
            "Flying attacker. Tailwind and Wide Guard give it a support option alongside the raw offense. Jolly with "
            "some bulk investment (16 HP alongside 18 Atk / 32 Spe in the tracked spread) reflects a fast attacker "
            "that still wants to survive a hit or two."
        ),
        "usage_tips": (
            "Tough Claws only boosts contact moves, so non-contact coverage (if any is run) doesn't get the same "
            "bonus - lean on Rock Slide/Dual Wingbeat/Ice Fang as the primary damage sources rather than any status "
            "or non-contact option. Its Speed tier is high enough to threaten most of the tier without a Choice "
            "item, keeping it flexible between attacking and using Tailwind/Wide Guard depending on the game state."
        ),
        "checks_and_counters": (
            "Steel-types resist Rock and Flying, its two STAB moves, and resist Ice Fang too - a clean answer to "
            "all three of its main attacking options at once, with nothing here to punch through it. Bulky Pokemon "
            "with recovery can outlast the pressure if Aerodactyl Mega can't secure a clean KO quickly. It's often "
            "paired with Kingambit and Sylveon, both of which cover different sides of the Steel-type answers that "
            "wall it."
        ),
    },
}


def main():
    db = SessionLocal()
    now = datetime.now(timezone.utc).isoformat()
    try:
        written = 0
        for name, sections in WRITEUPS.items():
            writeup = db.query(PokemonWriteup).filter(PokemonWriteup.pokemon_name == name).first()
            if not writeup:
                writeup = PokemonWriteup(pokemon_name=name)
                db.add(writeup)
            writeup.overview = sections.get("overview")
            writeup.moveset_notes = sections.get("moveset_notes")
            writeup.usage_tips = sections.get("usage_tips")
            writeup.checks_and_counters = sections.get("checks_and_counters")
            writeup.updated_at = now
            written += 1
        db.commit()
        print(f"Loaded {written} writeups.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
