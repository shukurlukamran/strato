(DO NOT TOUCH THIS FILE. THIS FILE IS FOR MY PERSONAL NOTES.)

# ✅ Military Actions & Cities System - COMPLETE PLAN AVAILABLE

See **MILITARY_AND_CITIES_PLAN.md** for the comprehensive implementation plan.

## Summary of Decisions Made:

### Cities System
- **6-15 cities per country** based on territory size
- Cities contain **proportional resources and population** that sum to country totals
- **Voronoi-based generation** with varied sizes and organic shapes
- **Click-to-show tooltip** with city details and attack button
- Cities can be **captured in combat** or **traded in deals**

### Military Actions
- **Attack neighboring cities only** (share border)
- **Strength allocation slider** (10-100% of military)
- **End-of-turn resolution** (not live combat)
- **Combat formula**: Strength ratio + randomness + defender bonus (20%)
- **Both sides lose troops**: Winner loses 20-40%, loser loses 40-80%
- **Costs**: 100 budget + 10 per strength point allocated

### AI Decisions
- **AI vs Player Defense**: Uses LLM (doesn't know attacker's allocation - FAIR)
- **AI vs Player Attack**: Uses LLM for strategic decisions
- **AI vs AI Combat**: Uses rule-based system (faster, cheaper)
- **Defense factors**: City value, military strength, strategic importance, personality

### Map Updates
- Dynamic city border visualization
- **Color changes when cities are captured**
- Cities shown with borders inside country territories
- Visual indicators for cities under attack

### History Logging
- All attacks logged with full details
- Combat results: winner, losses, city transfers
- Country eliminations tracked

### Technical Implementation
- 8 phases planned (see full document)
- Database schema designed
- Code structure outlined with TypeScript examples
- Balance considerations documented

## Next Steps:
1. Review the full plan in **MILITARY_AND_CITIES_PLAN.md**
2. Approve/adjust any decisions
3. Begin Phase 1: Cities Foundation implementation

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