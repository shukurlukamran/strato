(DO NOT TOUCH THIS FILE. THIS FILE IS FOR MY PERSONAL NOTES.)

- Add the current population growth percentage and breakdown of where it comes from to the Population tooltip

- In Deal chat, LLM responded with this which is unacceptable, it should keep  the conversation natural: "I've received your message: "But I want to buy more food from you. Let me know how much max food would you be wiling to give and what do you want in return?". Let me consider this carefully and get back to you."
- No deal detected in this conversation error when clicking Extract Deal in Deal chat
- AI countries should do deals between each-other and offer deals to Player (we should have a plan somewhere on this) (Only implement existing elements to deals for now). LLM Strategic Advices should include advices for this too but the actions should be executed without LLM. 
- Countries are able to buy/sell resources from/to black market at significantly worse rates than they would be able to get via trading with other countries. (When implementing this, remove allowing increase of infra and tech with penalty when resources are missing - game shouldn't allow these upgrades if resource requirements aren't met - now countries and players can buy them from black market too so they have option)
- History log should include any deals realized with details, including black market trades.

- Prevent cheating in the chat deals (you can get money for technology level now, but tech level isn't actually transferred, for example)
- Prevent abuse in the LLM chat (It shouldn't be possible to use it for anything unrelated to game - we also need to have some hard limits to prevent spamming, but this limit shouldn't interrupt gameplay. And negotiations may even cost some small money in the game to slightly discourage people to overuse it unnecessarily - Come up with a rational fair plan)
- Borders are sometimes messed up, especially when cities are captured. Sometimes there are some blank areas that doesn't belong to any country. We need to make these super defined with almost no place for error. 
- Bug: Deal Extractor struggles to understand that Player wants to sell something not buy
- Log in system and saving games to profiles

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
-------

Analyze root causes of these, understand what is happening, and then implement fixes. 

Make sure everything we build is aligned with LLM in both Deals chat and End turn decisions and anywhere else it may be used, and also with Supabase database.

Analyze root causes of these, understand what is happening, and create a concise plan with no fillers or bullshit for the implementation for helping other AI models to build it. Make sure everything we build is also aligned with Supabase database.

Analyze the plan carefully, understand what is happening, and then implement fixes. Feel free to ask me if there's anything unclear or anything you wanna clarify further regarding the plan. Make sure everything we build is also aligned with Supabase database.

We implemented the plan at @  Analyze and check to verify if these are now implemented correctly. If not, create a concise plan with no fillers or bullshit for the implementation for helping other AI models to build it. Make sure everything we build is also aligned with Supabase database.

We implemented @.plan.md and I'm sending vercel logs for different turns below. Analyze them to verify if the plan is now implemented correctly. If not, create a comprehensive plan for the implementation for helping other AI models to build it. Make sure everything we build is also aligned with Supabase database.