- Develop a plan for Military actions (attack, etc.) with simple actions for now and more complex action plans for future. AI countries should be able to use these actions too against Player or other AI countries just like the Actions we currently have. Decide the costs, advantages, disadvantages of using military actions. 

I also want the countries have cities inside separated with borders. Each country should have at least 6 cities, but ideally ranging between 6-15 cities depending on the area size on the map. Cities shouldn't be the same size and shape to make it look more interesting. We don't need any separate stats for cities, at least for now. 

But cities are for capturing and using in deals (can be given away in exchange of something else). Cities include some portion of country's "per turn resources and  population", which means when city moves from one country to another, that portion of per turn resources and population moves to the new country too. For example, city may have 5 oils, 2 gems, 3 coal per turn and 10000 population, etc. We also need to show City's name and what it includes with a tooltip that shows/hides when clicking on it (not hover). It's critical that sum of these per turn resources and populations for all cities inside a country should be the same with the total values of that country.

Attack ideas I have: A country can only capture or receive (in a deal) a neighboring city of another country, for now. When a city changes its nation, it should be shown inside the new country and with its color on the map - so we are updating the map to be interactive and flexible. When clicking on a city, there should be an Attack button on the opening tooltip. Decide how attack should be initiated, how combat resolution should be decided, and how much an attack should weaken both sides' army. Maybe both countries can decide how much of their military strength they wanna allocate to the specific attack/defense on a slider.

LLM should be initiated when a player attacks AI country to make the defense decision, but LLM shouldn't be informed how much military power player allocated for this attack to make it fair. You can decide if it's better to handle AI countries' attacks among each other or against Player by rules or LLM.

Also, decide if attack/defense should happen live or wait for turn end for the resolution.

History logs should include all military actions and their results.

This is pretty much rough plan, improve it, fill gaps and make sure it's implemented fair and properly.

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