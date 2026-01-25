export class DealMessageGenerator {
  /**
   * Generate natural-language description of a deal
   * Uses 20-30 templates for variety with proper role semantics
   * Deterministic based on deal content for reproducible outputs
   */
  generateDealMessage(
    proposerName: string,
    receiverName: string,
    proposerCommitments: any[],
    receiverCommitments: any[]
  ): string {
    // Flatten commitments into resources and budget
    const proposerResources = proposerCommitments.filter(c => c.type === 'resource_transfer');
    const proposerBudget = proposerCommitments.filter(c => c.type === 'budget_transfer');
    const receiverResources = receiverCommitments.filter(c => c.type === 'resource_transfer');
    const receiverBudget = receiverCommitments.filter(c => c.type === 'budget_transfer');

    // Determine deal type
    const hasProposerResources = proposerResources.length > 0;
    const hasProposerBudget = proposerBudget.length > 0;
    const hasReceiverResources = receiverResources.length > 0;
    const hasReceiverBudget = receiverBudget.length > 0;

    // Select appropriate template based on deal type (deterministic seed)
    // Use content-based seed for reproducibility
    const contentSeed = `${proposerName}${receiverName}${JSON.stringify(proposerCommitments)}${JSON.stringify(receiverCommitments)}`.charCodeAt(0) % 100;
    let templateIndex: number;

    if (hasProposerResources && hasReceiverResources && !hasProposerBudget && !hasReceiverBudget) {
      // Resource-for-resource deal
      templateIndex = contentSeed % 7; // Templates 0-6
    } else if (hasProposerResources && hasReceiverBudget && !hasProposerBudget && !hasReceiverResources) {
      // Resource-for-budget deal (proposer gives resources, receiver gives budget)
      templateIndex = 7 + (contentSeed % 4); // Templates 7-10
    } else if (hasProposerBudget && hasReceiverResources && !hasProposerResources && !hasReceiverBudget) {
      // Budget-for-resource deal (proposer gives budget, receiver gives resources)
      templateIndex = 11 + (contentSeed % 4); // Templates 11-14
    } else {
      // Complex deal with multiple types
      templateIndex = 15 + (contentSeed % 10); // Templates 15-24
    }

    return this.applyTemplate(templateIndex, proposerName, receiverName, proposerCommitments, receiverCommitments);
  }

  private applyTemplate(
    index: number,
    proposerName: string,
    receiverName: string,
    proposerCommitments: any[],
    receiverCommitments: any[]
  ): string {
    // Templates organized by type with correct role semantics
    const templates = [
      // Resource-for-Resource (0-6): proposer gives resource1, receiver gives resource2
      "{A} traded {X} {resource1} for {Y} {resource2} with {B}",
      "{A} exchanged {X} {resource1} with {B} for {Y} {resource2}",
      "{A} and {B} swapped resources: {X} {resource1} for {Y} {resource2}",
      "{A} gave {B} {X} {resource1} in return for {Y} {resource2}",
      "{B} received {Y} {resource2} from {A} for {X} {resource1}",
      "{A} bartered {X} {resource1} to {B} for {Y} {resource2}",
      "{A} and {B} conducted a resource exchange: {X} {resource1} ↔ {Y} {resource2}",

      // Resource-for-Budget (7-10): proposer gives resources, receiver gives budget (amount)
      "{A} sold {X} {resource} to {B} for ${A_payment}",
      "{B} purchased {X} {resource} from {A} for ${A_payment}",
      "{A} received ${A_payment} from {B} in exchange for {X} {resource}",
      "{B} bought {X} {resource} from {A} for ${A_payment}",

      // Budget-for-Resource (11-14): proposer gives budget (amount), receiver gives resources
      "{A} paid {B} ${A_payment} for {X} {resource}",
      "{A} acquired {X} {resource} from {B} for ${A_payment}",
      "{B} sold {X} {resource} to {A} for ${A_payment}",
      "{A} invested ${A_payment} in {X} {resource} from {B}",

      // Complex/Multi-resource deals (15-24): use clear A_gives and B_gives
      "{A} and {B} completed a comprehensive trade: {A_gives} for {B_gives}",
      "{A} secured {B_gives} from {B} in exchange for {A_gives}",
      "{B} provided {A_gives} to {A} in exchange for {B_gives}",
      "{A} negotiated {B_gives} from {B} for {A_gives}",
      "{A} and {B} established trade: {A_gives} for {B_gives}",
      "{A} obtained {B_gives} through trade with {B} for {A_gives}",
      "{B} supplied {A_gives} to {A} in return for {B_gives}",
      "{A} and {B} finalized an agreement: {summary}",
      "{A} exchanged {A_gives} with {B} for {B_gives}",
      "{A} and {B} conducted a major trade involving {summary}"
    ];

    let template = templates[index] || templates[0];

    // Replace name placeholders
    template = template.replace(/{A}/g, proposerName);
    template = template.replace(/{B}/g, receiverName);

    // Extract commitment details
    const proposerResources = proposerCommitments.filter(c => c.type === 'resource_transfer');
    const receiverResources = receiverCommitments.filter(c => c.type === 'resource_transfer');
    const proposerBudget = proposerCommitments.filter(c => c.type === 'budget_transfer');
    const receiverBudget = receiverCommitments.filter(c => c.type === 'budget_transfer');

    const totalProposerBudget = proposerBudget.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalReceiverBudget = receiverBudget.reduce((sum, c) => sum + (c.amount || 0), 0);

    // Handle resource placeholders (for simple 1v1 templates)
    if (proposerResources.length > 0) {
      template = template.replace(/{X}/g, proposerResources[0].amount.toString());
      template = template.replace(/{resource}/g, proposerResources[0].resource);
      template = template.replace(/{resource1}/g, proposerResources[0].resource);
    }

    if (receiverResources.length > 0) {
      template = template.replace(/{Y}/g, receiverResources[0].amount.toString());
      template = template.replace(/{resource2}/g, receiverResources[0].resource);
    }

    // Handle budget placeholders - use correct side
    // A_payment = what receiver pays to proposer (so proposer's incoming budget = receiverBudget OR proposer's outgoing budget)
    // This depends on template semantics; for "sold" it's the buyer's payment, so use totalReceiverBudget
    // For simplicity: {A_payment} is always the budget that moves TO proposer (from receiver)
    const aPayment = totalReceiverBudget > 0 ? totalReceiverBudget : totalProposerBudget;
    template = template.replace(/{A_payment}/g, aPayment.toString());
    template = template.replace(/{amount}/g, aPayment.toString());

    // Handle complex placeholders - use clear role-based formatting
    template = template.replace(/{A_gives}/g, this.formatCommitmentList(proposerCommitments));
    template = template.replace(/{B_gives}/g, this.formatCommitmentList(receiverCommitments));
    template = template.replace(/{items_list}/g, this.formatCommitmentList(proposerCommitments));
    template = template.replace(/{items}/g, this.formatCommitmentList(receiverCommitments));
    template = template.replace(/{payment}/g, this.formatCommitmentList(receiverCommitments));
    template = template.replace(/{summary}/g, this.createDealSummary(proposerCommitments, receiverCommitments));

    return template;
  }

  private formatCommitmentList(commitments: any[]): string {
    return commitments.map(c => {
      if (c.type === 'resource_transfer') {
        return `${c.amount}x ${c.resource}`;
      } else if (c.type === 'budget_transfer') {
        return `$${c.amount}`;
      }
      return c.type;
    }).join(' + ');
  }

  private createDealSummary(proposerCommitments: any[], receiverCommitments: any[]): string {
    const proposerDesc = this.formatCommitmentList(proposerCommitments);
    const receiverDesc = this.formatCommitmentList(receiverCommitments);
    return `${proposerDesc} for ${receiverDesc}`;
  }
}