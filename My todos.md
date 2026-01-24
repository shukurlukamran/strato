(DO NOT TOUCH THIS FILE. THIS FILE IS FOR MY PERSONAL NOTES.)


- LLM Stragic Advise is incorrect or not updated with the latest game data. Aurum is the weakest country with only a few armies yet it says countries are under defended vs Aurum (this issue may have been fixed now but not sure, check it). Also Vercel log doesn't show the list of actions recommended thus can't see if it works properly:


[LLM Planner] ✓ Successfully parsed 5/5 country analyses
[LLM Planner] ✓ Persisted strategic plan for 7192d918-9836-4920-b330-6fc1f1809d7e: 6 items
[LLM Planner] ✓ Borealis: balanced - Strong vs Dravon, under-Defended vs Aurum; upgrade infra, attack Dravon
[LLM Planner] ✓ Persisted strategic plan for 773e6eb7-bd17-4ba3-92ae-7325dccc51fb: 6 items
[LLM Planner] ✓ Cyrenia: balanced - Strong vs Dravon, under-Defended vs Aurum; upgrade infra, attack Dravon
[LLM Planner] ✓ Persisted strategic plan for 9262ee25-f86e-4393-b46e-f0a191af39ae: 6 items
[LLM Planner] ✓ Dravon: balanced - Weaker, under threat; focus on infra and tech, recruit minimally
[LLM Planner] ✓ Persisted strategic plan for 44ffcd09-49e0-4cdc-9773-f47997c250f9: 6 items
[LLM Planner] ✓ Eldoria: balanced - Strong vs Dravon, under-Defended vs Aurum; upgrade infra, attack Dravon
[LLM Planner] ✓ Persisted strategic plan for e2f16177-1d8e-40c5-bae5-0f2e47ea4b8a: 6 items
[LLM Planner] ✓ Falken: balanced - Strong vs Dravon, under-Defended vs Aurum; upgrade infra, attack Dravon
[Turn API] ✓ Batch analysis complete: 5 analyses received
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning

Another example from another turn/game where strategy looks weak:

[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning
[Strategic Planner] Country 8c564704-ae83-40d8-96e4-e0abf13a3394:
Rule-based: economy - Early game: Build economic foundation with infrastructure.
Fresh LLM: balanced - Build tech, recruit, then attack Cyrenia if stronger
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning
[Strategic Planner] Country 56fb4488-d327-4376-a452-309baaad597c:
Rule-based: economy - Early game: Build economic foundation with infrastructure.
Fresh LLM: balanced - Upgrade tech, recruit, attack Borealis when possible
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning
[Strategic Planner] Country ce546761-42a9-4ebf-9ea6-ef1d2f68abb7:
Rule-based: economy - Early game: Build economic foundation with infrastructure.
Fresh LLM: balanced - Strengthen infra, recruit, defend against Aurum
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning
[Strategic Planner] Country a8dcd67d-b118-4a94-8fbe-189d3149ff69:
Rule-based: research - Early game: Invest in technology for long-term growth.
Fresh LLM: balanced - Boost infra, recruit, hold against Aurum
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning
[Strategic Planner] Country d670779c-ff07-4de9-b139-e671ee193310:
Rule-based: economy - Early game: Build economic foundation with infrastructure.
Fresh LLM: balanced - Upgrade infra, recruit, attack Borealis if advantage

Another example from another turn/game where strategy looks weak and too focused on attacking the Player/any single country (Aurum here has significantly weak military so it may make sense but still it looks like a shallow strategy)?:

[LLM Planner] ✓ Borealis: balanced - Strong enough to attack Aurum, invest in infra
[LLM Planner] ✓ Persisted strategic plan for 1a780688-b317-4f4e-8439-e6b2dce0a7db: 6 items
[LLM Planner] ✓ Cyrenia: balanced - Can outmaneuver Aurum, need infra
[LLM Planner] ✓ Persisted strategic plan for aeb5b138-4a4f-4a3f-bde1-5b0c45c5455c: 6 items
[LLM Planner] ✓ Dravon: balanced - Strong, can conquer Aurum, upgrade infra
[LLM Planner] ✓ Persisted strategic plan for 0eac3509-d2a7-4511-972f-d1cb1affb55c: 6 items
[LLM Planner] ✓ Eldoria: balanced - Tech Innovator, can attack Aurum, need infra
[LLM Planner] ✓ Persisted strategic plan for 5e139243-db4e-4688-bc55-c95147998e12: 6 items
[LLM Planner] ✓ Falken: balanced - Can outflank Aurum, need infra
[Turn API] ✓ Batch analysis complete: 5 analyses received
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning
[Strategic Planner] Country 2409821d-4947-4b1d-b2ab-d0f61eab0cbe:
Rule-based: diplomacy - Cooperative approach. Seek alliances and trade partnerships.
Fresh LLM: balanced - Strong enough to attack Aurum, invest in infra
[LLM Planner] Using Groq openai/gpt-oss-20b for strategic planning

- **LLM should include the new resources mechanism for his decision-making**

- In Deal chat, LLM responded with this which is unacceptable, it should keep  the conversation natural: "I've received your message: "But I want to buy more food from you. Let me know how much max food would you be wiling to give and what do you want in return?". Let me consider this carefully and get back to you."
- No deal detected in this conversation error when clicking Extract Deal in Deal chat
- AI countries should do deals between each-other and offer deals to Player (we should have a plan somewhere on this) (Only implement existing elements to deals for now). LLM Strategic Advices should include advices for this too but the actions should be executed without LLM. 
- Countries are able to buy/sell resources from/to black market at significantly worse rates than they would be able to get via trading with other countries. (When implementing this, remove allowing increase of infra and tech with penalty when resources are missing - game shouldn't allow these upgrades if resource requirements aren't met - now countries and players can buy them from black market too so they have option)
- History log should include any deals realized with details, including black market trades.

In Defense window when player is attacked:
- "Allocated strength (58) exceeds effective military strength (56)" error after submitting the defense allocation even though effective military strength was 58, not 56.

- Prevent cheating in the chat deals (you can get money for technology level now, but tech level isn't actually transferred, for example)
- Prevent abuse in the LLM chat (It shouldn't be possible to use it for anything unrelated to game - we also need to have some hard limits to prevent spamming, but this limit shouldn't interrupt gameplay. And negotiations may even cost some small money in the game to slightly discourage people to overuse it unnecessarily - Come up with a rational fair plan)
- Borders are sometimes messed up, especially when cities are captured. Sometimes there are some blank areas that doesn't belong to any country. We need to make these super defined with almost no place for error. 
- Log in system and saving games to profiles

- City transfer mechanism in Deal Chat (analyze and see what can be exchanged or agreed with the current state of the game but doesn't exist in the deal chat's implementation capabilities)
- Bug: Deal Extractor struggles to understand that Player wants to sell something not buy
- Pulsing red border or persistent indicator for isUnderAttack for cities
- Based on LLM analysis and recommended actions, each turn end, choose 2 random countries that make a statement on 2 random things each. These statements will be shown in the History log. For example, X warns Y for building massive army in the neighborhood; X promises to be the most technologically advanced nation soon, etc. These should give some hint to these countries' plans or intentions, but shouldn't fully disclose everything. (This function is better if it's LLM-based so these statements are always unique, but if it costs too much or affects turn end speed too much, we can create 100-200 pre-made statements that can be used with rules. There should be many premade statements so they don't repeat often.)
- Player can hire an advisor by clicking "Hire Advisor" button that can tell them what they can improve (the advisor will be the same logic with LLM for AI countries). It should work immediately without needing to end the turn. Advisor can be hired only once each turn.
- AI countries may have dictators who thinks of themselves more than the country, and potential revolutions, protests, anger of people, etc
- LLM should have an understanding that the country is being attacked by another country or its cities have been captured in the last few turns.
- Plan how we can make "Estimated success chance" calculation in DefenseModal.tsx a better metric while keeping attacker's allocation unknown.
- Taking back your captured city shouldn't be condemned by other countries as an act of aggression.
- By turn 15-20, everyone is hostile to one another. We don't wanna discourage military actions much as the gameplay should be led by LLM strategy. But we should do something (such as implementing peace and non-agression treaties for X amount of turns as part of Deals)
- Implement non-aggression deal (currently our deals only support single-turn deals though), alliance, etc.
-------

Analyze root causes of these, understand what is happening, and then implement fixes. 

Make sure everything we build is aligned with LLM in both Deals chat and End turn decisions and anywhere else it may be used, and also with Supabase database.

Analyze root causes of these, understand what is happening, and create a comprehensive plan for the implementation for helping other AI models to build it.