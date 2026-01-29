"use client";

import { Tooltip } from "@/components/game/Tooltip";
import type { LeaderProfile } from "@/lib/ai/LeaderProfileService";

interface LeaderPersonalityPanelProps {
  profile: LeaderProfile;
}

// Generate a detailed overview text for the leader personality panel
function generateLeaderOverviewText(profile: LeaderProfile): string {
  const { traits, decisionWeights } = profile;

  const temperament = traits.temperament === 'fiery' ? 'passionate and energetic' :
                     traits.temperament === 'icy' ? 'cool and analytical' : 'calm and measured';

  const patience = traits.patience === 'impatient' ? 'prefers quick decisions' :
                  traits.patience === 'long_game' ? 'plans far ahead' : 'takes deliberate action';

  const aggression = decisionWeights.aggression > 0.6 ? 'aggressive expansion' :
                    decisionWeights.aggression < 0.4 ? 'defensive protection' : 'balanced foreign policy';

  const cooperation = decisionWeights.cooperativeness > 0.6 ? 'alliance-building' :
                     decisionWeights.cooperativeness < 0.4 ? 'independent action' : 'selective partnerships';

  const risk = decisionWeights.riskTolerance > 0.6 ? 'bold risk-taking' :
               decisionWeights.riskTolerance < 0.4 ? 'cautious approaches' : 'calculated risks';

  const honor = traits.honor === 'keeps_word' ? 'honorable and trustworthy' :
                traits.honor === 'pragmatic' ? 'flexible with agreements' : 'vengeful toward betrayal';

  const speech = traits.register === 'formal' ? 'formal diplomatic language' :
                 traits.register === 'streetwise' ? 'direct pragmatic speech' :
                 traits.register === 'folksy' ? 'conversational storytelling' : 'casual everyday talk';

  return `${profile.leaderName} is a ${temperament} leader who ${patience}. Their foreign policy emphasizes ${aggression} and ${cooperation}, with a tendency toward ${risk}. In diplomacy, they are known for being ${honor}, communicating through ${speech}. This unique combination shapes their nation's strategic decisions and international relations.`;
}

// Trait descriptions for tooltips
const TRAIT_DESCRIPTIONS: Record<string, Record<string, string>> = {
  register: {
    plain: "Speaks in everyday language, casual tone",
    formal: "Uses formal, diplomatic language",
    folksy: "Warm, colloquial style; tells stories",
    streetwise: "Direct, no-nonsense, pragmatic language",
  },
  verbosity: {
    terse: "Brief, to-the-point responses",
    balanced: "Natural mix of detail and brevity",
    expansive: "Detailed explanations and elaboration",
  },
  directness: {
    blunt: "Says exactly what they think, no filter",
    diplomatic: "Tactful, considers others' feelings",
    flowery: "Poetic, elaborate, embellished speech",
  },
  temperament: {
    calm: "Cool-headed, even-tempered",
    fiery: "Hot-blooded, passionate, easily agitated",
    icy: "Cold, detached, hard to read",
  },
  humor: {
    none: "Serious, no jokes or levity",
    dry: "Subtle, understated humor",
    playful: "Quick with jokes and witty remarks",
  },
  patience: {
    impatient: "Wants quick decisions, gets frustrated easily",
    steady: "Calm, methodical approach to decisions",
    long_game: "Thinks many turns ahead, plays the long strategy",
  },
  risk_appetite: {
    cautious: "Avoids risks, prefers safe options",
    measured: "Balanced risk/reward evaluation",
    daring: "Willing to take bold, high-reward risks",
  },
  aggression_doctrine: {
    pacifist: "Prefers peace, avoids military conflict",
    defensive: "Defensive stance, reacts to threats",
    expansionist: "Seeks territorial expansion and conquest",
  },
  cooperation_style: {
    isolationist: "Works alone, minimal alliances",
    transactional: "Cooperation based on mutual benefit",
    coalition_builder: "Seeks alliances and partnerships",
  },
  honor: {
    pragmatic: "Breaks agreements if advantageous",
    keeps_word: "Always honors commitments",
    vengeful: "Never forgets betrayal, seeks revenge",
  },
  fairness: {
    hard_bargainer: "Drives tough deals, takes advantage",
    market_fair: "Values equal exchange at market rates",
    generous: "Offers favorable terms, prefers fairness",
  },
  paranoia: {
    trusting: "Assumes good faith from others",
    wary: "Cautious, suspects hidden motives",
    paranoid: "Sees threats everywhere, extremely distrustful",
  },
  pride: {
    humble: "Modest, doesn't boast about achievements",
    proud: "Values honor and dignity",
    arrogant: "Believes they're superior to others",
  },
  empathy: {
    low: "Unmoved by others' suffering or emotions",
    medium: "Considers others' perspectives sometimes",
    high: "Deeply concerned for others' wellbeing",
  },
  greed: {
    low: "Content with what they have",
    medium: "Wants reasonable gains",
    high: "Always seeking more wealth and power",
  },
  ideology: {
    realist: "Pragmatic, focused on practical outcomes",
    idealist: "Values principles and beliefs",
    opportunist: "Exploits any advantage available",
  },
  planning_style: {
    planner: "Careful, long-term strategy focus",
    improviser: "Adapts on the fly, flexible",
    gambler: "Takes chances, relies on luck",
  },
};

export function LeaderPersonalityPanel({ profile }: LeaderPersonalityPanelProps) {
  return (
    <div className="rounded-lg border border-gray-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
      {/* Header with Leader Info */}
      <div className="mb-3">
        <h3 className="text-lg font-bold text-gray-900">{profile.leaderName}</h3>
        <p className="text-xs text-gray-600">{profile.title}</p>
        {profile.publicValues && (
          <p className="mt-1 text-xs italic text-gray-700">{profile.publicValues}</p>
        )}
      </div>

      {/* Personality Overview */}
      <div className="mb-3 rounded-lg bg-amber-100/50 p-3 border border-amber-200">
        <p className="text-sm font-semibold text-amber-800 mb-2">LEADER PROFILE</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          {profile.summary?.trim() || generateLeaderOverviewText(profile)}
        </p>
      </div>

      {/* Personality Traits Grid */}
      <div className="mb-3 border-t pt-3">
        <p className="mb-2 text-xs font-semibold text-gray-700">PERSONALITY</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(profile.traits)
            .filter(([key]) => key !== "speech_tics")
            .map(([traitKey, traitValue]) => {
              const descriptions = TRAIT_DESCRIPTIONS[traitKey];
              const description = descriptions ? descriptions[String(traitValue)] : null;
              const displayValue = String(traitValue).replace(/_/g, " ");

              return (
                <Tooltip
                  key={traitKey}
                  content={description || `${traitKey}: ${displayValue}`}
                  className="inline-block"
                >
                  <div className="rounded bg-white px-2 py-1 text-xs">
                    <span className="font-semibold text-gray-700">{traitKey.replace(/_/g, " ")}:</span>
                    <br />
                    <span className="text-amber-700">{displayValue}</span>
                  </div>
                </Tooltip>
              );
            })}
        </div>
      </div>

      {/* Speech Tics */}
      {profile.traits.speech_tics && profile.traits.speech_tics.length > 0 && (
        <div className="border-t pt-2">
          <p className="mb-1 text-xs font-semibold text-gray-700">SPEECH PATTERNS</p>
          <ul className="text-xs text-gray-700">
            {profile.traits.speech_tics.map((tic, idx) => (
              <li key={idx} className="ml-2 list-disc text-gray-600">
                {tic}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Decision Weights Summary */}
      <div className="mt-2 border-t pt-2">
        <p className="mb-1 text-xs font-semibold text-gray-700">DECISION TENDENCIES</p>
        <div className="space-y-0.5 text-xs">
          <DecisionWeightBar label="Aggression" value={profile.decisionWeights.aggression} />
          <DecisionWeightBar label="Cooperation" value={profile.decisionWeights.cooperativeness} />
          <DecisionWeightBar label="Risk Tolerance" value={profile.decisionWeights.riskTolerance} />
          <DecisionWeightBar label="Honesty" value={profile.decisionWeights.honesty} />
          <DecisionWeightBar label="Patience" value={profile.decisionWeights.patience} />
          <DecisionWeightBar label="Fairness" value={profile.decisionWeights.fairness} />
        </div>
      </div>
    </div>
  );
}

function DecisionWeightBar({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100);
  const color =
    value > 0.65
      ? "bg-red-500"
      : value > 0.55
        ? "bg-orange-500"
        : value > 0.45
          ? "bg-yellow-500"
          : value > 0.35
            ? "bg-blue-300"
            : "bg-blue-600";

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-right text-gray-700">{label}:</span>
      <div className="flex flex-1 items-center gap-1">
        <div className="h-3 w-20 rounded bg-gray-200">
          <div className={`h-full rounded ${color}`} style={{ width: `${percentage}%` }} />
        </div>
        <span className="w-8 text-gray-600">{percentage}%</span>
      </div>
    </div>
  );
}
