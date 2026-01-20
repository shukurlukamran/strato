/**
 * Profile Modifiers System
 * Handles all country profile-based cost modifiers and bonuses
 * Each profile has unique advantages/disadvantages for different aspects
 */

import type { ResourceProfile } from './ResourceProfile';

/**
 * Get technology upgrade cost modifier based on profile
 */
export function getProfileTechCostModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Technological Hub': 0.75,      // 25% cheaper - tech is their strength
    'Balanced Nation': 1.0,          // Standard cost
    'Coastal Trading Hub': 1.10,    // 10% more expensive - trade focused
    'Oil Kingdom': 1.10,             // 10% more expensive - resource focused
    'Agriculture': 1.15,             // 15% more expensive - rural/traditional
    'Mining Empire': 1.15,           // 15% more expensive - extraction focused
    'Industrial Complex': 1.15,     // 15% more expensive - building focused
    'Precious Metals Trader': 1.20, // 20% more expensive - luxury/trade focused
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get infrastructure upgrade cost modifier based on profile
 */
export function getProfileInfraCostModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Industrial Complex': 0.80,      // 20% cheaper - building is their strength
    'Coastal Trading Hub': 0.85,    // 15% cheaper - trade infrastructure
    'Balanced Nation': 1.0,          // Standard cost
    'Agriculture': 1.05,             // 5% more expensive - rural/spread out
    'Technological Hub': 1.10,      // 10% more expensive - focused on tech not building
    'Mining Empire': 1.15,           // 15% more expensive - remote locations
    'Oil Kingdom': 1.15,             // 15% more expensive - desert/remote
    'Precious Metals Trader': 1.20, // 20% more expensive - poor infrastructure
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get military recruitment cost modifier based on profile
 */
export function getProfileMilitaryCostModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Mining Empire': 0.90,           // 10% cheaper - tough workers, martial culture
    'Technological Hub': 0.90,      // 10% cheaper - advanced weapons/training
    'Oil Kingdom': 0.95,             // 5% cheaper - oil wealth funds military
    'Industrial Complex': 0.95,     // 5% cheaper - production capacity
    'Balanced Nation': 1.0,          // Standard cost
    'Agriculture': 1.05,             // 5% more expensive - peaceful farmers
    'Coastal Trading Hub': 1.10,    // 10% more expensive - peaceful traders
    'Precious Metals Trader': 1.15, // 15% more expensive - wealthy but unmartial
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get tax revenue modifier based on profile
 */
export function getProfileTaxModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Precious Metals Trader': 1.10,  // 10% bonus - wealth concentration
    'Technological Hub': 1.05,      // 5% bonus - efficient economy
    'Balanced Nation': 1.0,          // Standard
    'Mining Empire': 0.95,           // 5% penalty - wealth in resources not cash
    'Agriculture': 1.0,              // Standard - self-sufficient
    'Industrial Complex': 1.0,       // Standard
    'Coastal Trading Hub': 1.0,     // Standard - relies on trade not tax
    'Oil Kingdom': 1.0,              // Standard - oil wealth through trade
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get trade revenue modifier based on profile
 */
export function getProfileTradeModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  const modifiers: Record<string, number> = {
    'Coastal Trading Hub': 1.25,     // 25% bonus - trade is their specialty
    'Precious Metals Trader': 1.15, // 15% bonus - luxury exports
    'Industrial Complex': 1.10,     // 10% bonus - manufactured goods export
    'Oil Kingdom': 1.05,             // 5% bonus - oil exports
    'Balanced Nation': 1.0,          // Standard
    'Technological Hub': 1.0,       // Standard
    'Mining Empire': 1.0,            // Standard - resources but not trade-focused
    'Agriculture': 0.95,             // 5% penalty - self-sufficient, less trade
  };
  
  return modifiers[profile.name] || 1.0;
}

/**
 * Get military effectiveness modifier (future use - when you have combat)
 */
export function getProfileMilitaryEffectivenessModifier(profile: ResourceProfile | null | undefined): number {
  if (!profile) return 1.0;
  
  // Currently all 1.0, but can be adjusted later for balance
  const modifiers: Record<string, number> = {
    'Mining Empire': 1.05,           // 5% bonus - tough fighters
    'Technological Hub': 1.0,       // Standard (tech gives bonus separately)
    'Balanced Nation': 1.0,          // Standard
    'Industrial Complex': 1.0,       // Standard
    'Oil Kingdom': 1.0,              // Standard
    'Agriculture': 0.95,             // 5% penalty - peaceful culture
    'Coastal Trading Hub': 0.95,    // 5% penalty - peaceful traders
    'Precious Metals Trader': 0.95, // 5% penalty - unmartial
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
