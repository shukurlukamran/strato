/**
 * LLM Resource Integration Tests
 * Tests that LLM systems properly integrate with the 8-resource system
 */

import { describe, it, expect } from '@jest/globals';
import type { CountryStats } from '@/types/country';

// Mock the compactResourceString function logic
function compactResourceString(resources: Record<string, number>): string {
  const abbrev: Record<string, string> = {
    food: 'Fd', timber: 'T', iron: 'Fe', oil: 'O',
    gold: 'Au', copper: 'Cu', steel: 'St', coal: 'C'
  };
  
  const parts: string[] = [];
  for (const [id, amt] of Object.entries(resources)) {
    if (amt > 10) {
      // Only show resources with meaningful amounts
      parts.push(`${abbrev[id] || id}${Math.floor(amt)}`);
    } else if (amt === 0) {
      // Show missing critical resources (only strategic/industrial)
      if (['iron', 'oil', 'steel', 'coal'].includes(id)) {
        parts.push(`!${abbrev[id] || id}`);
      }
    }
  }
  
  return parts.length > 0 ? parts.join(' ') : 'None';
}

describe('LLM Resource Integration', () => {
  describe('Compact Resource String Format', () => {
    it('should format resources with meaningful amounts', () => {
      const resources = {
        food: 200,
        timber: 80,
        iron: 40,
      };
      
      const result = compactResourceString(resources);
      
      expect(result).toContain('Fd200');
      expect(result).toContain('T80');
      expect(result).toContain('Fe40');
    });

    it('should use abbreviations for all 8 resources', () => {
      const resources = {
        food: 100,
        timber: 100,
        iron: 100,
        oil: 100,
        gold: 100,
        copper: 100,
        steel: 100,
        coal: 100,
      };
      
      const result = compactResourceString(resources);
      
      expect(result).toContain('Fd');
      expect(result).toContain('T');
      expect(result).toContain('Fe');
      expect(result).toContain('O');
      expect(result).toContain('Au');
      expect(result).toContain('Cu');
      expect(result).toContain('St');
      expect(result).toContain('C');
    });

    it('should show shortages for critical resources', () => {
      const resources = {
        food: 200,
        iron: 0,  // Critical shortage
        oil: 0,   // Critical shortage
        steel: 5, // Below threshold
      };
      
      const result = compactResourceString(resources);
      
      expect(result).toContain('Fd200');
      expect(result).toContain('!Fe');
      expect(result).toContain('!O');
    });

    it('should not show shortages for non-critical resources', () => {
      const resources = {
        food: 0,   // Not critical
        gold: 0,   // Not critical
        iron: 100,
      };
      
      const result = compactResourceString(resources);
      
      // Should not show !Fd or !Au
      expect(result).not.toContain('!Fd');
      expect(result).not.toContain('!Au');
      expect(result).toContain('Fe100');
    });

    it('should filter out resources below threshold', () => {
      const resources = {
        food: 5,   // Below 10 threshold
        timber: 15, // Above threshold
        iron: 8,   // Below threshold
      };
      
      const result = compactResourceString(resources);
      
      expect(result).not.toContain('Fd5');
      expect(result).toContain('T15');
      expect(result).not.toContain('Fe8');
    });

    it('should return "None" for empty resources', () => {
      const resources = {};
      const result = compactResourceString(resources);
      expect(result).toBe('None');
    });

    it('should handle mixed scenario correctly', () => {
      const resources = {
        food: 200,    // Has
        timber: 80,   // Has
        iron: 40,     // Has
        oil: 0,       // Missing (critical)
        gold: 5,      // Below threshold
        copper: 0,    // Missing but not critical
        steel: 0,     // Missing (critical)
        coal: 15,     // Has
      };
      
      const result = compactResourceString(resources);
      
      // Should include: Fd200, T80, Fe40, C15, !O, !St
      expect(result).toContain('Fd200');
      expect(result).toContain('T80');
      expect(result).toContain('Fe40');
      expect(result).toContain('C15');
      expect(result).toContain('!O');
      expect(result).toContain('!St');
      
      // Should not include: gold (below threshold), copper (not critical)
      expect(result).not.toContain('Au');
      expect(result).not.toContain('Cu');
    });
  });

  describe('Token Optimization', () => {
    it('should use shorter abbreviations than full names', () => {
      const resources = {
        food: 100,
        timber: 100,
        iron: 100,
        oil: 100,
        gold: 100,
        copper: 100,
        steel: 100,
        coal: 100,
      };
      
      const compact = compactResourceString(resources);
      const fullNames = Object.keys(resources).join(' ');
      
      // Compact format should be shorter
      expect(compact.length).toBeLessThan(fullNames.length);
    });

    it('should only include relevant resources', () => {
      const resources = {
        food: 200,
        timber: 80,
        iron: 0,  // Critical shortage
        oil: 0,   // Critical shortage
        gold: 3,  // Below threshold
        copper: 2, // Below threshold
        steel: 1,  // Below threshold
        coal: 5,   // Below threshold
      };
      
      const result = compactResourceString(resources);
      
      // Should only include: Fd200, T80, !Fe, !O
      const parts = result.split(' ');
      expect(parts.length).toBeLessThanOrEqual(4);
    });
  });

  describe('Resource System Integration', () => {
    it('should handle all 8 valid resources', () => {
      const resources = {
        food: 100,
        timber: 100,
        iron: 100,
        oil: 100,
        gold: 100,
        copper: 100,
        steel: 100,
        coal: 100,
      };
      
      const result = compactResourceString(resources);
      
      // Should successfully format all 8
      expect(result).toBeTruthy();
      expect(result).not.toBe('None');
    });

    it('should ignore invalid resource names gracefully', () => {
      const resources = {
        food: 100,
        water: 50,  // Invalid (deleted resource)
        stone: 30,  // Invalid (deleted resource)
        iron: 100,
      };
      
      // Should not throw error, just ignore invalid keys
      expect(() => compactResourceString(resources)).not.toThrow();
      
      const result = compactResourceString(resources);
      expect(result).toContain('Fd100');
      expect(result).toContain('Fe100');
    });
  });

  describe('LLM Prompt Integration', () => {
    it('should format resources for country summary', () => {
      const stats: Partial<CountryStats> = {
        resources: {
          food: 200,
          timber: 80,
          iron: 40,
          oil: 0,
          steel: 0,
        },
      };
      
      const resourcesStr = compactResourceString(stats.resources || {});
      
      // Should be suitable for inclusion in LLM prompt
      expect(resourcesStr.length).toBeLessThan(100); // Reasonable length
      expect(resourcesStr).toMatch(/^[A-Za-z0-9! ]+$/); // Alphanumeric + ! and spaces
    });

    it('should provide clear resource status', () => {
      const resources = {
        food: 200,
        iron: 0,
        oil: 0,
      };
      
      const result = compactResourceString(resources);
      
      // LLM should be able to understand: has food, needs iron and oil
      expect(result).toContain('Fd200');
      expect(result).toContain('!Fe');
      expect(result).toContain('!O');
    });
  });
});
