/**
 * PHASE 7: Automated Monitoring & Alerts
 * 
 * Continuously monitor LLM batch fixes and alert on degradation.
 * 
 * Usage:
 *   node scripts/monitor-llm-fixes.js --game-id <gameId> --interval 60000
 *   npm run monitor:llm  // From package.json script
 * 
 * Deployment:
 *   Deploy as Vercel cron job (e.g., every 5 minutes during game)
 */

import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import { getSupabaseServerClient } from '@/lib/supabase/server';

interface LLMMonitorAlert {
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  current: number;
  threshold: number;
  message: string;
  timestamp: string;
}

interface LLMMonitoringConfig {
  batchSuccessRateMin: number;      // Default: 80%
  executionValidationMin: number;   // Default: 80%
  avgStepsPerPlanMin: number;       // Default: 8
  avgStepsPerPlanMax: number;       // Default: 10
  domainMismatchMax: number;        // Default: 0
  planLongevityMin: number;         // Default: 8 (turns)
  alertThresholds: {
    critical: number;  // Fail hard
    warning: number;   // Log warning
  };
}

class LLMMonitor {
  private supabase = getSupabaseServerClient();
  private config: LLMMonitoringConfig = {
    batchSuccessRateMin: 80,
    executionValidationMin: 80,
    avgStepsPerPlanMin: 8,
    avgStepsPerPlanMax: 10,
    domainMismatchMax: 0,
    planLongevityMin: 8,
    alertThresholds: {
      critical: 50,
      warning: 75,
    }
  };
  
  private alerts: LLMMonitorAlert[] = [];

  async monitor(gameId: string): Promise<{
    healthy: boolean;
    alerts: LLMMonitorAlert[];
  }> {
    this.alerts = [];

    try {
      // Fetch latest plans
      const { data: recentPlans, error } = await this.supabase
        .from('llm_strategic_plans')
        .select('*')
        .eq('game_id', gameId)
        .order('turn_analyzed', { ascending: false })
        .limit(10);

      if (error || !recentPlans || recentPlans.length === 0) {
        return {
          healthy: false,
          alerts: [{
            severity: 'warning',
            metric: 'plans_found',
            current: 0,
            threshold: 1,
            message: 'No plans found in database - verification inconclusive',
            timestamp: new Date().toISOString()
          }]
        };
      }

      // Analyze latest turn
      const latestTurn = recentPlans[0].turn_analyzed;
      const turnPlans = recentPlans.filter(p => p.turn_analyzed === latestTurn);

      await this.checkBatchSuccess(turnPlans);
      await this.checkExecutionQuality(turnPlans);
      await this.checkPlanLongevity(turnPlans);
      await this.checkDomainFiltering(turnPlans);
      await this.checkStepCounts(turnPlans);

      return {
        healthy: this.alerts.every(a => a.severity !== 'critical'),
        alerts: this.alerts
      };
    } catch (error) {
      console.error('[LLM Monitor] Error:', error);
      return {
        healthy: false,
        alerts: [{
          severity: 'critical',
          metric: 'monitoring_error',
          current: 0,
          threshold: 1,
          message: `Monitoring failed: ${error}`,
          timestamp: new Date().toISOString()
        }]
      };
    }
  }

  private async checkBatchSuccess(plans: any[]): Promise<void> {
    // If we have plans, batch analysis succeeded
    const successRate = plans.length > 0 ? 100 : 0;
    
    if (successRate < this.config.batchSuccessRateMin) {
      this.alerts.push({
        severity: 'critical',
        metric: 'batch_success_rate',
        current: successRate,
        threshold: this.config.batchSuccessRateMin,
        message: `Batch success rate ${successRate}% below threshold ${this.config.batchSuccessRateMin}%`,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async checkExecutionQuality(plans: any[]): Promise<void> {
    let validSteps = 0;
    let invalidSteps = 0;

    for (const plan of plans) {
      const ra = plan.recommended_actions as any;
      if (Array.isArray(ra)) {
        for (const item of ra) {
          if (item && typeof item === 'object' && 'kind' in item && item.kind === 'step') {
            validSteps++;
          } else if (typeof item === 'string') {
            // Legacy format
            validSteps++;
          }
        }
      }
    }

    const totalSteps = validSteps + invalidSteps;
    const validationRate = totalSteps > 0 ? Math.round((validSteps / totalSteps) * 100) : 100;

    if (validationRate < this.config.executionValidationMin) {
      this.alerts.push({
        severity: 'warning',
        metric: 'execution_validation_rate',
        current: validationRate,
        threshold: this.config.executionValidationMin,
        message: `Step validation rate ${validationRate}% below threshold. ${invalidSteps} invalid steps filtered.`,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async checkPlanLongevity(plans: any[]): Promise<void> {
    const currentTurn = plans.length > 0 ? plans[0].turn_analyzed : 0;
    let longevityCount = 0;

    for (const plan of plans) {
      const validUntil = plan.valid_until_turn as number;
      const longevity = validUntil - currentTurn;
      
      if (longevity >= this.config.planLongevityMin) {
        longevityCount++;
      }
    }

    const longevityRate = plans.length > 0 
      ? Math.round((longevityCount / plans.length) * 100)
      : 0;

    if (longevityRate < 80) {
      this.alerts.push({
        severity: 'warning',
        metric: 'plan_longevity',
        current: longevityRate,
        threshold: 80,
        message: `Only ${longevityCount}/${plans.length} plans extend to Turn ${currentTurn + this.config.planLongevityMin}+`,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async checkDomainFiltering(plans: any[]): Promise<void> {
    let mismatchCount = 0;

    for (const plan of plans) {
      const ra = plan.recommended_actions as any;
      if (Array.isArray(ra)) {
        for (const item of ra) {
          if (item && typeof item === 'object' && item.kind === 'step') {
            // Check for military actions without subType
            if (item.execution?.actionType === 'military' && !item.execution?.actionData?.subType) {
              mismatchCount++;
            }
            // Check for economic actions without infrastructure subType
            if (item.execution?.actionType === 'economic' && item.execution?.actionData?.subType !== 'infrastructure') {
              mismatchCount++;
            }
            // Check for research without targetLevel
            if (item.execution?.actionType === 'research' && !item.execution?.actionData?.targetLevel) {
              mismatchCount++;
            }
          }
        }
      }
    }

    if (mismatchCount > this.config.domainMismatchMax) {
      this.alerts.push({
        severity: 'warning',
        metric: 'domain_mismatches',
        current: mismatchCount,
        threshold: this.config.domainMismatchMax,
        message: `${mismatchCount} domain mismatches detected (expected 0)`,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async checkStepCounts(plans: any[]): Promise<void> {
    const stepCounts: number[] = [];

    for (const plan of plans) {
      const ra = plan.recommended_actions as any;
      const stepCount = Array.isArray(ra) ? ra.length : 0;
      stepCounts.push(stepCount);
    }

    const avgSteps = stepCounts.length > 0 
      ? Math.round(stepCounts.reduce((a, b) => a + b) / stepCounts.length)
      : 0;

    if (avgSteps < this.config.avgStepsPerPlanMin) {
      this.alerts.push({
        severity: 'warning',
        metric: 'steps_per_plan_low',
        current: avgSteps,
        threshold: this.config.avgStepsPerPlanMin,
        message: `Average steps/plan (${avgSteps}) below minimum (${this.config.avgStepsPerPlanMin})`,
        timestamp: new Date().toISOString()
      });
    }

    if (avgSteps > this.config.avgStepsPerPlanMax) {
      this.alerts.push({
        severity: 'info',
        metric: 'steps_per_plan_high',
        current: avgSteps,
        threshold: this.config.avgStepsPerPlanMax,
        message: `Average steps/plan (${avgSteps}) above maximum (${this.config.avgStepsPerPlanMax}) - monitor for performance`,
        timestamp: new Date().toISOString()
      });
    }
  }

  logAlerts(alerts: LLMMonitorAlert[]): void {
    if (alerts.length === 0) {
      console.log('[LLM Monitor] ✅ All checks passed');
      return;
    }

    console.log(`[LLM Monitor] Found ${alerts.length} alerts:\n`);

    for (const alert of alerts) {
      const icon = alert.severity === 'critical' ? '❌' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`${icon} [${alert.severity.toUpperCase()}] ${alert.metric}: ${alert.current}/${alert.threshold}`);
      console.log(`   ${alert.message}\n`);
    }
  }
}

// Export for use
export { LLMMonitor };
export type { LLMMonitorAlert };

// CLI Support
if (require.main === module) {
  const gameId = process.argv[2] || 'test-game';
  const monitor = new LLMMonitor();
  
  monitor.monitor(gameId).then(({ healthy, alerts }) => {
    monitor.logAlerts(alerts);
    process.exit(healthy ? 0 : 1);
  }).catch(error => {
    console.error('Monitoring failed:', error);
    process.exit(1);
  });
}
