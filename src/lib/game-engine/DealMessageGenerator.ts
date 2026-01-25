export class DealMessageGenerator {
  /**
   * Generate natural-language description of a deal
   * Uses 20-30 templates for variety
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

    // Select appropriate template based on deal type
    let templateIndex: number;

    if (hasProposerResources && hasReceiverResources && !hasProposerBudget && !hasReceiverBudget) {
      // Resource-for-resource deal
      templateIndex = Math.floor(Math.random() * 7); // Templates 0-6
    } else if (hasProposerResources && hasReceiverBudget && !hasProposerBudget && !hasReceiverResources) {
      // Resource-for-budget deal (proposer gives resources, receiver gives budget)
      templateIndex = 7 + Math.floor(Math.random() * 4); // Templates 7-10
    } else if (hasProposerBudget && hasReceiverResources && !hasProposerResources && !hasReceiverBudget) {
      // Budget-for-resource deal (proposer gives budget, receiver gives resources)
      templateIndex = 11 + Math.floor(Math.random() * 4); // Templates 11-14
    } else {
      // Complex deal with multiple types
      templateIndex = 15 + Math.floor(Math.random() * 10); // Templates 15-24
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
    const templates = [
      // Resource-for-Resource (0-6)
      "{A} traded {X} {resource1} for {Y} {resource2} with {B}",
      "{A} exchanged {X} {resource1} with {B} for {Y} {resource2}",
      "{A} and {B} swapped resources: {X} {resource1} for {Y} {resource2}",
      "{A} gave {B} {X} {resource1} in return for {Y} {resource2}",
      "{B} received {Y} {resource2} from {A} for {X} {resource1}",
      "{A} bartered {X} {resource1} to {B} for {Y} {resource2}",
      "{A} and {B} conducted a resource exchange: {X} {resource1} ↔ {Y} {resource2}",

      // Resource-for-Budget (7-10)
      "{A} sold {X} {resource} to {B} for ${amount}",
      "{B} purchased {X} {resource} from {A} for ${amount}",
      "{A} received ${amount} from {B} in exchange for {X} {resource}",
      "{B} bought {X} {resource} from {A} for ${amount}",

      // Budget-for-Resource (11-14)
      "{A} paid {B} ${amount} for {X} {resource}",
      "{A} acquired {X} {resource} from {B} for ${amount}",
      "{B} sold {X} {resource} to {A} for ${amount}",
      "{A} invested ${amount} in {X} {resource} from {B}",

      // Complex/Multi-resource deals (15-24)
      "{A} traded {items_list} with {B} for {payment}",
      "{A} and {B} completed a comprehensive deal involving {summary}",
      "{A} secured {items} from {B} for {payment}",
      "{B} provided {A} with {items} in exchange for {payment}",
      "{A} negotiated {items} from {B} for {payment}",
      "{A} and {B} established trade: {A_gives} for {B_gives}",
      "{A} obtained {items} through trade with {B} for {payment}",
      "{B} supplied {A} with {items} in return for {payment}",
      "{A} and {B} finalized an agreement: {summary}",
      "{A} exchanged {A_gives} with {B} for {B_gives}"
    ];

    let template = templates[index] || templates[0];

    // Replace placeholders
    template = template.replace(/{A}/g, proposerName);
    template = template.replace(/{B}/g, receiverName);

    // Handle resource placeholders
    const proposerResources = proposerCommitments.filter(c => c.type === 'resource_transfer');
    const receiverResources = receiverCommitments.filter(c => c.type === 'resource_transfer');
    const proposerBudget = proposerCommitments.filter(c => c.type === 'budget_transfer');
    const receiverBudget = receiverCommitments.filter(c => c.type === 'budget_transfer');

    if (proposerResources.length > 0) {
      template = template.replace(/{X}/g, proposerResources[0].amount.toString());
      template = template.replace(/{resource}/g, proposerResources[0].resource);
      template = template.replace(/{resource1}/g, proposerResources[0].resource);
    }

    if (receiverResources.length > 0) {
      template = template.replace(/{Y}/g, receiverResources[0].amount.toString());
      template = template.replace(/{resource2}/g, receiverResources[0].resource);
    }

    // Handle budget placeholders
    const totalProposerBudget = proposerBudget.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalReceiverBudget = receiverBudget.reduce((sum, c) => sum + (c.amount || 0), 0);

    if (totalProposerBudget > 0) {
      template = template.replace(/{amount}/g, totalProposerBudget.toString());
    } else if (totalReceiverBudget > 0) {
      template = template.replace(/{amount}/g, totalReceiverBudget.toString());
    }

    // Handle complex placeholders
    template = template.replace(/{items_list}/g, this.formatCommitmentList(proposerCommitments));
    template = template.replace(/{payment}/g, this.formatCommitmentList(receiverCommitments));
    template = template.replace(/{items}/g, this.formatCommitmentList(receiverCommitments));
    template = template.replace(/{summary}/g, this.createDealSummary(proposerCommitments, receiverCommitments));
    template = template.replace(/{A_gives}/g, this.formatCommitmentList(proposerCommitments));
    template = template.replace(/{B_gives}/g, this.formatCommitmentList(receiverCommitments));

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