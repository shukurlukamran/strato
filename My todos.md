(DO NOT TOUCH THIS FILE. THIS FILE IS FOR MY PERSONAL NOTES.)

- AI countries don't follow LLM's strategy advices. LLM gives strategy advices and plan every 5 turn and countries are expected to follow this advice for the next 5 turns. We still need to have rule-based logic as a fallback but LLM's advice should be followed mainly if it exists.

We already build some kind of cached plan that persists LLM plan for the next turns but it still doens't work at all. Make sure this cached plan includes action steps given by LLM and this plan is prioritized by countries. Or build it in another way if this isn't a good way to do it.

- Optimize LLM on End turn to be faster.
- Resource usage (actions should use resources and each resource should at least have one use case)
- Prevent cheating in the chat deals (you can get money for technology level now, but tech level isn't actually transferred, for example)
- Prevent abuse in the LLM chat (It shouldn't be possible to use it for anything unrelated to game - we also need to have some hard limits to prevent spamming, but this limit shouldn't interrupt gameplay. And negotiations may even cost some small money in the game to slightly discourage people to overuse it unnecessarily - Come up with a rational fair plan)
- Borders are sometimes messed up, especially when cities are captured. Sometimes there are some blank areas that doesn't belong to any country. We need to make these super defined with almost no place for error. 
- Log in system and saving games to profiles

- City transfer mechanism in Deal Chat (analyze and see what can be exchanged or agreed with the current state of the game but doesn't exist in the deal chat's implementation capabilities)
- AI countries should do deals between each-other (we should have a plan somewhere on this)
- Does LLM take into account country's current budget, diplomatic relations, their war status while suggesting a strategy at turn end? 
- Bug: Deal Extractor struggles to understand that Player wants to sell something not buy
- Include possible attack ideas and defense caution to LLM's strategic advices
- Pulsing red border or persistent indicator for isUnderAttack for cities
- AI should initiate deal requests too (to player and among each other - among each other can be done in the background without AI probably)
- Countries are able to buy/sell resources from/to black market at significantly worse rates than they would be able to get via trading with other countries.
- History log should include any deals realized with details, including black market trades.
- Based on LLM analysis and recommended actions, each turn end, choose 2 random countries that make a statement on 2 random things each. These statements will be shown in the History log. For example, X warns Y for building massive army in the neighborhood; X promises to be the most technologically advanced nation soon, etc. These should give some hint to these countries' plans or intentions, but shouldn't fully disclose everything. (This function is better if it's LLM-based so these statements are always unique, but if it costs too much or affects turn end speed too much, we can create 100-200 pre-made statements that can be used with rules. There should be many premade statements so they don't repeat often.)
- Player can hire an advisor by clicking "Hire Advisor" button that can tell them what they can improve (the advisor will be the same logic with LLM for AI countries). It should work immediately without needing to end the turn. Advisor can be hired only once each turn.
- Countries are able to sell their resources to black market at cheaper rates than they would be able to get via trading with other countries.
- AI countries may have dictators who thinks of themselves more than the country, and potential revolutions, protests, anger of people, etc
- AI countries can do more than one action a turn, don't force it but make sure the system allows for it when it makes sense to do so.
-------

Analyze root causes of these, understand what is happening, and then implement fixes. 

Make sure everything we build is aligned with LLM in both Deals chat and End turn decisions and anywhere else it may be used, and also with Supabase database.

CRITICAL: Also, let me know which model is currently in use for building this task - I need this to be able to adjust the code properly while editing manually.