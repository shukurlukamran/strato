import type { Country } from "@/types/country";

export interface StatementEvent {
  type: 'statement.intent' | 'statement.rumor';
  message: string;
  data?: Record<string, unknown>;
}

export class NarrativeEngine {
  private statementTemplates: string[] = [
    // Military statements
    "{Country} is conducting large-scale maneuvers near the border of {Target}.",
    "{Country} has increased military spending by 15% this quarter.",
    "{Country} announces plans to modernize its air force.",
    "{Country} warns {Target} about provocative military actions.",
    "{Country} conducts joint military exercises with allies.",
    "{Country} deploys additional troops to contested regions.",

    // Diplomatic statements
    "{Country} seeks closer ties with {Target}.",
    "{Country} proposes a new trade agreement with {Target}.",
    "{Country} expresses concerns over {Target}'s foreign policy.",
    "{Country} invites {Target} for diplomatic talks.",
    "{Country} criticizes {Target}'s stance on international issues.",
    "{Country} offers mediation in {Target}'s regional conflicts.",

    // Technological statements
    "{Country} announces a breakthrough in energy research.",
    "{Country} unveils new advancements in military technology.",
    "{Country} invests heavily in artificial intelligence development.",
    "{Country} shares technological expertise with {Target}.",
    "{Country} accelerates its space program development.",
    "{Country} pioneers new medical research initiatives.",

    // Economic statements
    "{Country} plans to subsidize its heavy industry.",
    "{Country} announces new economic reforms.",
    "{Country} invests in infrastructure development.",
    "{Country} faces economic challenges due to global market shifts.",
    "{Country} expands its international trade network.",
    "{Country} implements new tax policies to boost growth.",

    // Strategic statements
    "{Country} strengthens alliances in the region.",
    "{Country} monitors {Target}'s activities closely.",
    "{Country} reevaluates its defense strategy.",
    "{Country} expands its intelligence network.",
    "{Country} develops contingency plans for regional instability.",
    "{Country} enhances border security measures.",

    // International relations
    "{Country} participates in international peacekeeping efforts.",
    "{Country} joins new international organizations.",
    "{Country} responds to global climate initiatives.",
    "{Country} addresses humanitarian concerns in neighboring regions.",
    "{Country} coordinates with allies on security matters.",
    "{Country} observes changing power dynamics in the region."
  ];

  private rumorTemplates: string[] = [
    // Rumor templates (more speculative)
    "Rumors suggest {Country} is planning military action against {Target}.",
    "Intelligence reports indicate {Country} has secret negotiations with {Target}.",
    "Sources claim {Country} has made significant technological discoveries.",
    "Whispers of economic turmoil reach from {Country}'s capital.",
    "Diplomatic cables suggest {Country} is realigning its alliances.",
    "Market analysts predict major economic shifts in {Country}.",
    "Regional observers note unusual military movements in {Country}.",
    "Confidential reports detail {Country}'s covert operations."
  ];

  generateStatements(countries: Country[]): StatementEvent[] {
    if (countries.length < 2) {
      return [];
    }

    const events: StatementEvent[] = [];

    // Select 2 random countries (or all if fewer than 2)
    const selectedCountries = this.getRandomCountries(countries, 2);

    for (const country of selectedCountries) {
      // Generate 2 statements per country
      const countryStatements = this.generateStatementsForCountry(country, countries);
      events.push(...countryStatements);
    }

    return events;
  }

  private generateStatementsForCountry(country: Country, allCountries: Country[]): StatementEvent[] {
    const events: StatementEvent[] = [];

    // Generate 1 intent statement and 1 rumor statement
    const intentTemplate = this.getRandomTemplate(this.statementTemplates);
    const rumorTemplate = this.getRandomTemplate(this.rumorTemplates);

    // For intent statements, sometimes target another country
    const intentMessage = this.populateTemplate(intentTemplate, country, allCountries, true);
    events.push({
      type: 'statement.intent',
      message: intentMessage,
      data: {
        countryId: country.id,
        countryName: country.name,
        category: this.categorizeTemplate(intentTemplate)
      }
    });

    // For rumor statements, sometimes target another country
    const rumorMessage = this.populateTemplate(rumorTemplate, country, allCountries, Math.random() < 0.6);
    events.push({
      type: 'statement.rumor',
      message: rumorMessage,
      data: {
        countryId: country.id,
        countryName: country.name,
        category: this.categorizeTemplate(rumorTemplate)
      }
    });

    return events;
  }

  private getRandomCountries(countries: Country[], count: number): Country[] {
    const shuffled = [...countries].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, countries.length));
  }

  private getRandomTemplate(templates: string[]): string {
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private populateTemplate(
    template: string,
    country: Country,
    allCountries: Country[],
    includeTarget: boolean
  ): string {
    let message = template.replace(/{Country}/g, country.name);

    if (includeTarget && template.includes('{Target}')) {
      // Select a different country as target
      const otherCountries = allCountries.filter(c => c.id !== country.id);
      if (otherCountries.length > 0) {
        const targetCountry = otherCountries[Math.floor(Math.random() * otherCountries.length)];
        message = message.replace(/{Target}/g, targetCountry.name);
      } else {
        // Fallback: remove target references if no other countries available
        message = message.replace(/{Target}/g, 'regional powers');
      }
    } else if (template.includes('{Target}')) {
      // Remove target references if not including target
      message = message.replace(/{Target}/g, 'regional powers');
    }

    return message;
  }

  private categorizeTemplate(template: string): string {
    if (template.toLowerCase().includes('military') || template.includes('troops') || template.includes('force')) {
      return 'military';
    } else if (template.toLowerCase().includes('diplomatic') || template.includes('ties') || template.includes('talks')) {
      return 'diplomatic';
    } else if (template.toLowerCase().includes('technological') || template.includes('research') || template.includes('technology')) {
      return 'technological';
    } else if (template.toLowerCase().includes('economic') || template.includes('trade') || template.includes('industry')) {
      return 'economic';
    } else {
      return 'strategic';
    }
  }
}