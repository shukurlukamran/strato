export type LLMBans = {
  banRecruitment: boolean;
  banTechUpgrades: boolean;
  banInfrastructureUpgrades: boolean;
  reasons: string[]; // raw steps that caused bans
};

const NEGATION = /\b(refrain|avoid|do\s*not|don't|no)\b/i;

export function extractLLMBans(rawSteps: string[]): LLMBans {
  const steps = Array.isArray(rawSteps) ? rawSteps : [];
  const reasons: string[] = [];
  let banRecruitment = false;
  let banTechUpgrades = false;
  let banInfrastructureUpgrades = false;

  for (const raw of steps) {
    const step = String(raw ?? "").trim();
    if (!step) continue;

    if (!NEGATION.test(step)) continue;

    const lower = step.toLowerCase();

    if (/\b(military\s+recruit|recruitment|recruit\s+any|recruit\s+military|train\s+military|conscrip)\b/i.test(step)) {
      banRecruitment = true;
      reasons.push(step);
      continue;
    }

    if (/\b(technology\s+upgrades?|tech\s+upgrades?|research|increase\s+technology|upgrade\s+tech)\b/i.test(step)) {
      banTechUpgrades = true;
      reasons.push(step);
      continue;
    }

    if (/\b(infrastructure\s+upgrades?|infra\s+upgrades?|build\s+infrastructure|upgrade\s+infrastructure)\b/i.test(step)) {
      banInfrastructureUpgrades = true;
      reasons.push(step);
      continue;
    }

    // Also handle mixed bans like "Avoid all Infrastructure upgrades for the next 5 turns"
    if (lower.includes("infrastructure")) {
      banInfrastructureUpgrades = true;
      reasons.push(step);
      continue;
    }
    if (lower.includes("technology") || lower.includes("tech") || lower.includes("research")) {
      banTechUpgrades = true;
      reasons.push(step);
      continue;
    }
    if (lower.includes("recruit")) {
      banRecruitment = true;
      reasons.push(step);
      continue;
    }
  }

  return { banRecruitment, banTechUpgrades, banInfrastructureUpgrades, reasons };
}

export function isOneTimeStep(raw: string): boolean {
  const step = String(raw ?? "").trim();
  if (!step) return false;
  // Anything with "after ..." is almost always meant as a gated one-off.
  if (/\bafter\b/i.test(step)) return true;
  // "additional/extra/more" implies one-off
  if (/\b(additional|extra|more)\b/i.test(step)) return true;
  // Ranges like "10-15" are usually a one-off batch
  if (/\b\d{1,3}\s*-\s*\d{1,3}\b/.test(step)) return true;
  return false;
}

export function extractNumberRange(raw: string): { min: number; max: number } | null {
  const step = String(raw ?? "");
  const m = step.match(/\b(\d{1,3})\s*-\s*(\d{1,3})\b/);
  if (!m?.[1] || !m?.[2]) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

export function extractTargetTechLevel(raw: string): number | null {
  const step = String(raw ?? "");
  // "Tech L3", "Tech level 3", "Technology Level 3"
  const m1 = step.match(/\b(?:tech|technology)\s*(?:level|lvl)?\s*L?\s*(\d)\b/i);
  if (m1?.[1]) {
    const n = Number(m1[1]);
    if (Number.isFinite(n)) return Math.max(0, Math.min(5, Math.floor(n)));
  }
  // "L3 upgrade" (only when near tech/technology)
  const m2 = step.match(/\bL(\d)\b/i);
  if (m2?.[1] && /\b(?:tech|technology)\b/i.test(step)) {
    const n = Number(m2[1]);
    if (Number.isFinite(n)) return Math.max(0, Math.min(5, Math.floor(n)));
  }
  return null;
}

export function extractTargetInfraLevel(raw: string): number | null {
  const step = String(raw ?? "");
  const m1 = step.match(/\b(?:infrastructure|infra)\s*(?:level|lvl)?\s*L?\s*(\d{1,2})\b/i);
  if (m1?.[1]) {
    const n = Number(m1[1]);
    if (Number.isFinite(n)) return Math.max(0, Math.min(10, Math.floor(n)));
  }
  return null;
}

export function looksLikeTechUpgradeStep(raw: string): boolean {
  const step = String(raw ?? "");
  // Require an *upgrade* verb, not mere mentions of "tech"
  return /\b(research|upgrade|increase|raise)\b/i.test(step) && /\b(tech|technology)\b/i.test(step);
}

export function looksLikeInfrastructureUpgradeStep(raw: string): boolean {
  const step = String(raw ?? "");
  return /\b(build|upgrade|increase|raise)\b/i.test(step) && /\b(infrastructure|infra)\b/i.test(step);
}

