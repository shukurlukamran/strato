(DO NOT TOUCH THIS FILE. THIS FILE IS FOR MY PERSONAL NOTES.)

- Some cities aren't attackable even though they are neighbor.
- When a city is captured, other cities neighboring it becomes unattackable.
- City transfer mechanism in Deal Chat (analyze and see what can be exchanged or agreed with the current state of the game but doesn't exist in the deal chat's implementation capabilities)
- Find out what other stages are left in the full implementation of Military and cities plan
- AI countries should do deals between each-other (we should have a plan somewhere on this)
- Does LLM take into account country's current budget, diplomatic relations, their war status while suggesting a strategy at turn end? 
- AI countries don't follow LLM's strategy advices.
- Optimize LLM on End turn to be faster.
- Bug: AI country defended successfully with 2.5x less army. How is this possible? Player attacked 2 cities at the same turn, both failed but only one should have failed, the other should have been captured because player army was 2.5x bigger. If it is because of some multipliers or defence advantages, they should be mentioned clearly in the History log as well to explain why the result happened so.
- Bug: Deal Extractor struggles to understand that Player wants to sell something not buy
- War should affect diplomatic stance


- Resource usage (actions should use resources and each resource should at least have one use case)
- Prevent cheating in the chat deals (you can get money for technology level now, but tech level isn't actually transferred, for example)
- AI should initiate deal requests too (to player and among each other - among each other can be done in the background without AI probably)
- Player shouldn't be able to see the "Propose Deal" button for their own country, it should only be shown for other countries.
- Countries are able to buy/sell resources from/to black market at significantly worse rates than they would be able to get via trading with other countries.
- History log should include any deals realized with details, including black market trades.
- Make sure everything we build is aligned with LLM in both Deals chat and End turn decisions, and also with Supabase.

- Prevent cheating in the chat deals (you can get money for technology level now, but tech level isn't actually transferred, for example)
- Based on LLM analysis and recommended actions, each turn end, choose 2 random countries that make a statement on 2 random things each. These statements will be shown in the History log. For example, X warns Y for building massive army in the neighborhood; X promises to be the most technologically advanced nation soon, etc. These should give some hint to these countries' plans or intentions, but shouldn't fully disclose everything. (This function is better if it's LLM-based so these statements are always unique, but if it costs too much or affects turn end speed too much, we can create 100-200 pre-made statements that can be used with rules. There should be many premade statements so they don't repeat often.)
- Player can hire an advisor by clicking "Hire Advisor" button that can tell them what they can improve (the advisor will be the same logic with LLM for AI countries). It should work immediately without needing to end the turn. Advisor can be hired only once each turn.
- Countries are able to sell their resources to black market at cheaper rates than they would be able to get via trading with other countries.
- Player can hire an advisor by clicking "Hire Advisor" button that can tell them what they can improve (the advisor will be the same logic with LLM for AI countries). It should work immediately without needing to end the turn. Advisor can be hired only once each turn.
-------

Analyze root causes of these, understand what is happening, and then implement fixes. 

Make sure everything we build is aligned with LLM in both Deals chat and End turn decisions and anywhere else it may be used, and also with Supabase database.

CRITICAL: Also, let me know which model is currently in use for building this task - I need this to be able to adjust the code properly while editing manually.