/**
 * Profile Modifiers System
 * Handles all country profile-based cost modifiers and bonuses
 * Each profile has unique advantages/disadvantages for different aspects
 */

import type { ResourceProfile } from './ResourceProfile';

/**
 * Get technology upgrade cost modifier based on profile
 * Updated for 8-resource system profiles
 */
export function getProfileTechCostModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Tech Innovator': 0.75,         // 25% cheaper - tech is their strength
    'Balanced Nation': 1.0,         // Standard cost
    'Trade Hub': 1.10,               // 10% more expensive - trade focused
    'Oil Kingdom': 1.10,             // 10% more expensive - resource focused
    'Agricultural Hub': 1.15,       // 15% more expensive - rural/traditional
    'Mining Empire': 1.15,          // 15% more expensive - extraction focused
    'Industrial Powerhouse': 1.15,  // 15% more expensive - building focused
    'Military State': 1.20,         // 20% more expensive - military focused
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get infrastructure upgrade cost modifier based on profile
 * Updated for 8-resource system profiles
 */
export function getProfileInfraCostModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Industrial Powerhouse': 0.80,  // 20% cheaper - building is their strength
    'Trade Hub': 0.85,              // 15% cheaper - trade infrastructure
    'Balanced Nation': 1.0,         // Standard cost
    'Agricultural Hub': 1.05,       // 5% more expensive - rural/spread out
    'Tech Innovator': 1.10,         // 10% more expensive - focused on tech not building
    'Mining Empire': 1.15,          // 15% more expensive - remote locations
    'Oil Kingdom': 1.15,            // 15% more expensive - desert/remote
    'Military State': 1.20,         // 20% more expensive - military focused
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get military recruitment cost modifier based on profile
 * Updated for 8-resource system profiles
 */
export function getProfileMilitaryCostModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Military State': 0.85,          // 15% cheaper - military is their strength
    'Mining Empire': 0.90,          // 10% cheaper - tough workers, martial culture
    'Tech Innovator': 0.90,         // 10% cheaper - advanced weapons/training
    'Oil Kingdom': 0.95,            // 5% cheaper - oil wealth funds military
    'Industrial Powerhouse': 0.95,  // 5% cheaper - production capacity
    'Balanced Nation': 1.0,         // Standard cost
    'Agricultural Hub': 1.05,       // 5% more expensive - peaceful farmers
    'Trade Hub': 1.10,              // 10% more expensive - peaceful traders
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get tax revenue modifier based on profile
 * Updated for 8-resource system profiles
 */
export function getProfileTaxModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Trade Hub': 1.10,               // 10% bonus - wealth concentration
    'Tech Innovator': 1.05,         // 5% bonus - efficient economy
    'Balanced Nation': 1.0,         // Standard
    'Mining Empire': 0.95,          // 5% penalty - wealth in resources not cash
    'Agricultural Hub': 1.0,       // Standard - self-sufficient
    'Industrial Powerhouse': 1.0,   // Standard
    'Oil Kingdom': 1.0,             // Standard - oil wealth through trade
    'Military State': 0.95,         // 5% penalty - military spending
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get trade revenue modifier based on profile
 * Updated for 8-resource system profiles
 */
export function getProfileTradeModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Trade Hub': 1.25,               // 25% bonus - trade is their specialty
    'Oil Kingdom': 1.10,             // 10% bonus - oil exports
    'Industrial Powerhouse': 1.10,   // 10% bonus - manufactured goods export
    'Tech Innovator': 1.05,         // 5% bonus - technology exports
    'Balanced Nation': 1.0,         // Standard
    'Mining Empire': 1.0,           // Standard - resources but not trade-focused
    'Agricultural Hub': 0.95,       // 5% penalty - self-sufficient, less trade
    'Military State': 0.90,         // 10% penalty - isolationist
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get military effectiveness modifier (future use - when you have combat)
 * Updated for 8-resource system profiles
 */
export function getProfileMilitaryEffectivenessModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  // Currently all 1.0, but can be adjusted later for balance
  const modifiers: Record<string, number> = {
    'Military State': 1.10,          // 10% bonus - military culture
    'Mining Empire': 1.05,           // 5% bonus - tough fighters
    'Tech Innovator': 1.0,         // Standard (tech gives bonus separately)
    'Balanced Nation': 1.0,         // Standard
    'Industrial Powerhouse': 1.0,   // Standard
    'Oil Kingdom': 1.0,             // Standard
    'Agricultural Hub': 0.95,       // 5% penalty - peaceful culture
    'Trade Hub': 0.95,              // 5% penalty - peaceful traders
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Helper to get profile name safely
 */
export function getProfileName(profile: ResourceProfile | null | undefined): string {
  return profile?.name || 'Unknown';
}

/**
 * Get all modifiers for a profile at once (useful for display)
 */
export function getAllProfileModifiers(profile: ResourceProfile | null | undefined) {
  return {
    techCost: getProfileTechCostModifier(profile),
    infraCost: getProfileInfraCostModifier(profile),
    militaryCost: getProfileMilitaryCostModifier(profile),
    taxRevenue: getProfileTaxModifier(profile),
    tradeRevenue: getProfileTradeModifier(profile),
    militaryEffectiveness: getProfileMilitaryEffectivenessModifier(profile),
  };
}
