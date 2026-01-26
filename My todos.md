(DO NOT TOUCH THIS FILE. THIS FILE IS FOR MY PERSONAL NOTES.)

Stil persists:
- History log shows that deals with Player are automatically confirmed - we built deal window like defense window - why doesn't it appear when Player receives a deal offer?
- LLM Trade actions - removed?
- Attack non-neighbor - removed?

---
- Log in system and saving games to profiles
- Prevent abuse in the LLM chat (It shouldn't be possible to use it for anything unrelated to game - we also need to have some hard limits to prevent spamming, but this limit shouldn't interrupt gameplay. And negotiations may even cost some small money in the game to slightly discourage people to overuse it unnecessarily - Come up with a rational fair plan)
- Diplomacy system (simple for now) (non-agression pact, trade should increase relationship, ask for help, alliance)
- Define a few winning conditions - and let LLM know them

---
**LLM CHAT**

- LLM in the chat should be diplomatic, and strategic. For example, when a significantly obviously powerful Player demands tribute and threatening to attack unless tribute paid, LLM should analyze and decide if it should pay tribute or not. To prevent abuses, such cases should always be a way to make it official, such as non-agression pact for X amount of turns in this case.
- Each country's LLM should have a random character (affecting decisions, talking style, etc.)
- Chat conversations should be able to affect diplomatic relationships a bit. Build it in a way that can't be abused.

---
- Prevent cheating in the chat deals (you can get money for technology level now, but tech level isn't actually transferred, for example)
- Borders are sometimes messed up, especially when cities are captured. Sometimes there are some blank areas that doesn't belong to any country. We need to make these super defined with almost no place for error. 
- Defense window slider should allow zero military strength allocation too

- City transfer mechanism in Deal Chat (analyze and see what can be exchanged or agreed with the current state of the game but doesn't exist in the deal chat's implementation capabilities)
- Pulsing red border or persistent indicator for isUnderAttack for cities
- Player can hire an advisor by clicking "Hire Advisor" button that can tell them what they can improve (the advisor will be the same logic with LLM for AI countries). It should work immediately without needing to end the turn. Advisor can be hired only once each turn.
- AI countries may have dictators who thinks of themselves more than the country, and potential revolutions, protests, anger of people, etc
- LLM should have an understanding that the country is being attacked by another country or its cities have been captured in the last few turns.
- Plan how we can make "Estimated success chance" calculation in DefenseModal.tsx a better metric while keeping attacker's allocation unknown.
- Taking back your captured city shouldn't be condemned by other countries as an act of aggression.
- By turn 15-20, everyone is hostile to one another. We don't wanna discourage military actions much as the gameplay should be led by LLM strategy. But we should do something (such as implementing peace and non-agression treaties for X amount of turns as part of Deals)
- Implement non-aggression deal (currently our deals only support single-turn deals though), alliance, etc.
- Players have advantage in attack/defense logic: Player attacks are resolved in the next turn, AI attacks gives 1 turn to Player for defense allocation. Solution: When player ends turn, after AI countries made their moves, before moving to the next turn, if there's any attack on player, stay in the same turn and require the player to allocate defense on the same turn, and end turn once the defense allocation has been done by player for all incoming attacks.
- Add different sounds to clicks (have an option to mute)
- Improve News narratives to be more realistic
- History log should include significant price changes in the base costs of resources between the current and previous turns. For example, "Iron price surged staggering 30%".
- In the window showing current costs of resources, add a graph for each resource showing their price movement in the last 10 turns.
- If LLM Planner takes too long, we may split it into 2 sessions (for example, on turn 5, planner is activated for half of the countries, and on turn 10, for the other half)
- AI countries should consider more things when deciding which country and city to attack: Military strength, City's resources (if they need those resources), City's population (the more, the better for expansion), Diplomatic relationships with the other countries (good relationships should have some benefits such as trade bonuses, etc.)
- If a country including Players is getting attacked by more than once (can be different attacker countries or the same country attacking a few different cities), any allocated military strength should deducted from the next allocation. For example, X country has 150 military strength and received 3 different attacks in this turn. If it allocates 50 strength to the 1st attack, it will have 100 strength left to allocate to the other 2 attacks.

Also, currently Defense window for the 2nd received attack only appears after submitting allocation to the 1st attack. However, Player should receive them all at the same time so he knows how many attacks he received this turn and decide allocation accordingly.
-------

Analyze root causes of these, understand what is happening, and then implement fixes. 

Make sure everything we build is aligned with LLM in both Deals chat and End turn decisions and anywhere else it may be used, tooltips, and also with Supabase database.

Analyze root causes of these, understand what is happening, and create a concise plan with no fillers or bullshit for the implementation for helping other AI models to build it. Make sure everything we build is also aligned with Supabase database.

Analyze the plan carefully, understand what is happening, and then implement fixes. Feel free to ask me if there's anything unclear or anything you wanna clarify further regarding the plan. Make sure everything we build is also aligned with Supabase database.

----

We implemented the plan at @ Analyze and check to verify if these are now implemented correctly. If not, create a comprehensive plan for the implementation for helping other AI models to build it. Make sure everything we build is also aligned with LLM in both Deals chat and End turn decisions and anywhere else it may be used, Tooltips, and also with Supabase database.

I want you to do a very thourough analysis including verifying calculations and algorithms work as intended. 

Do not report back what is fixed or already implemented. Only provide what is missing, wrong, or should/can be changed/optimized.
