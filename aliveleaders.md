Based on the code and research on believable AI personalities, here are practical improvements to make your leaders feel more human and dynamic: [techxplore](https://techxplore.com/news/2025-08-ai-game-characters-realistic-personalities.html)

## Dynamic Emotional States

Your current system has fixed personality traits, but real leaders have **moods and emotional states that shift based on recent events**. Add a temporary emotion layer: [xbytesolutions](https://www.xbytesolutions.com/why-realistic-ai-npcs-matter-in-game-development/)

```typescript
interface EmotionalState {
  currentMood: "confident" | "anxious" | "angry" | "conciliatory" | "desperate";
  stress: number; // 0-1, increases with wars/losses
  recentGrievances: string[]; // "betrayed by PlayerX turn 45"
  momentum: "ascending" | "stable" | "declining";
}
```

A leader with `patience: "long_game"` might become impatient if their stress is high or they're losing territory. This creates interesting moments where normally diplomatic leaders lash out after repeated provocations. [science](https://www.science.org/doi/10.1126/science.ade9097)

## Relationship Memory System

Leaders should remember **specific interactions and hold grudges or gratitude**. Currently, every negotiation starts fresh: [science](https://www.science.org/doi/10.1126/science.ade9097)

```typescript
interface RelationshipMemory {
  trustLevel: number; // Built/eroded over time
  historicalEvents: {
    turn: number;
    event: "alliance_formed" | "deal_broken" | "war_declared" | "aid_received";
    impact: number; // +/- trust modifier
  }[];
  perceivedReliability: number; // Did they keep past promises?
  personalRespect: number; // Separate from trust
}
```

A leader with `honor: "vengeful"` should remember betrayals for 50+ turns and refuse deals with that player, even if strategically beneficial. This makes diplomacy feel consequential. [science](https://www.science.org/doi/10.1126/science.ade9097)

## Hidden Agendas and Inconsistencies

Real politicians don't always act according to their stated values. Add: [oreateai](http://oreateai.com/blog/navigating-the-future-the-rise-of-ai-diplomacy-games/6271dee55e540c1af9132e19d0368ae4)

- **Secret priorities** that differ from `publicValues` (a "generous" leader might be secretly greedy)
- **Hypocrisy threshold** based on `honor` trait (how much they'll contradict themselves for gain)
- **Blind spots** (even cautious leaders have 1-2 areas where they're reckless)

This creates the delightful realism of leaders who preach one thing but do another under pressure.

## Contextual Personality Shifts

Your weights are static, but humans behave differently based on **resource scarcity, war, economic crisis**: [techxplore](https://techxplore.com/news/2025-08-ai-game-characters-realistic-personalities.html)

```typescript
function adjustWeightsForContext(
  baseWeights: LeaderDecisionWeights,
  context: GameContext
): LeaderDecisionWeights {
  const adjusted = {...baseWeights};
  
  // Desperate leaders become more aggressive or cooperative
  if (context.resourceStarvation) {
    adjusted.aggression *= context.militaryStrength > 0.7 ? 1.4 : 0.6;
    adjusted.cooperativeness *= 1.3; // Desperate for aid
  }
  
  // Winning streaks increase pride/arrogance
  if (context.recentVictories > 3) {
    adjusted.riskTolerance *= 1.2;
    adjusted.fairness *= 0.8; // Less willing to compromise
  }
  
  return adjusted;
}
```

## Cultural and Ideological Depth

Your `ideology` trait is currently one-dimensional. Expand with **specific worldviews** that shape interpretation of events:

- **Economic philosophy**: "free_market" vs "interventionist" vs "socialist"
- **Foreign policy doctrine**: "isolationist" vs "globalist" vs "regional_hegemon"
- **Historical narrative**: "victimized_nation" vs "manifest_destiny" vs "peacekeeper"

A leader with `ideology: "idealist"` + `foreignPolicy: "globalist"` should genuinely care about other nations' suffering (high empathy in aid decisions) but might also justify intervention wars as "spreading democracy."

## Personality Evolution Over Time

Leaders should **change gradually based on game events**: [reddit](https://www.reddit.com/r/truegaming/comments/5wy86e/taking_procedural_generation_to_the_next_level/)

- A `temperament: "calm"` leader who gets betrayed 3 times might drift toward `"icy"`
- A `risk_appetite: "daring"` leader who loses a major gamble might become `"measured"`
- Long peaceful reigns should reduce `paranoia`, while frequent wars increase it

Track a `personalityDrift` object that applies small modifiers each turn based on experiences.

## Speech Pattern Variety

Your speech tics are good, but add **contextual dialogue variations**:

- Formal leaders become informal when angry ("Enough of this nonsense!")
- Expansive leaders become terse when threatened
- Different greetings for allies vs rivals vs strangers
- Callback phrases referencing past deals ("Remember when we agreed on grain shipments? Unlike *some* leaders...")

## Irrational Biases and Pet Peeves

Humans have illogical preferences. Give each leader 1-2 random quirks: [techxplore](https://techxplore.com/news/2025-08-ai-game-characters-realistic-personalities.html)

- Won't trade coal because "it reminds them of their childhood"
- Irrationally values a specific worthless territory (prestige location)
- Dislikes a specific resource type or technology path
- Personal vendetta against one random country (independent of rational strategy)

## Decision Uncertainty

Your weights create deterministic decisions. Add **doubt and second-guessing**:

```typescript
interface DecisionProcess {
  confidence: number; // 0-1, based on information quality
  alternativesConsidered: number; // Planners consider more options
  regretProbability: number; // Might reverse decision next turn
  advisorInfluence: number; // Sometimes act against personality
}
```

A `planning_style: "improviser"` leader might make quick decisions with low confidence and reverse course unpredictably, creating frustrating but realistic inconsistency.

## Implementation Priority

Start with **relationship memory** (highest impact, moderate effort) and **emotional states** (creates immediate drama). These two additions alone would make leaders feel vastly more alive and reactive to player actions, transforming them from static personalities into dynamic characters with memory, moods, and personal grudges. [smu](https://www.smu.edu/news/research/video-game-characters-ai-personalities)