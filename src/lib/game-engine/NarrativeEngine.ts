import type { Country } from "@/types/country";

export interface StatementEvent {
  type: 'statement.intent' | 'statement.rumor';
  message: string;
  data?: Record<string, unknown>;
}

export class NarrativeEngine {
  private statementTemplates: string[] = [
    // Military statements (30 templates)
    "{Country} is conducting large-scale maneuvers near the border of {Target}.",
    "{Country} has increased military spending by 15% this quarter.",
    "{Country} announces plans to modernize its air force.",
    "{Country} warns {Target} about provocative military actions.",
    "{Country} conducts joint military exercises with allies.",
    "{Country} deploys additional troops to contested regions.",
    "{Country} strengthens its naval presence in international waters.",
    "{Country} tests new missile defense systems.",
    "{Country} expands its military intelligence operations.",
    "{Country} mobilizes reserve forces for training exercises.",
    "{Country} upgrades its armored vehicle fleet.",
    "{Country} establishes new military bases in strategic locations.",
    "{Country} increases recruitment for special forces units.",
    "{Country} develops advanced cyber warfare capabilities.",
    "{Country} participates in multinational military drills.",
    "{Country} reinforces border defenses with new technology.",
    "{Country} conducts aerial surveillance missions over disputed territories.",
    "{Country} modernizes its submarine fleet.",
    "{Country} enhances military cooperation with neighboring countries.",
    "{Country} invests in drone technology for reconnaissance.",
    "{Country} establishes rapid deployment forces.",
    "{Country} upgrades missile systems with precision guidance.",
    "{Country} expands its military satellite network.",
    "{Country} conducts live-fire exercises in remote areas.",
    "{Country} develops next-generation stealth technology.",
    "{Country} increases military aid to allied nations.",
    "{Country} establishes military training programs for partner countries.",
    "{Country} deploys peacekeeping forces to international hotspots.",
    "{Country} modernizes its artillery capabilities.",
    "{Country} expands its military logistics network.",

    // Diplomatic statements (30 templates)
    "{Country} seeks closer ties with {Target}.",
    "{Country} proposes a new trade agreement with {Target}.",
    "{Country} expresses concerns over {Target}'s foreign policy.",
    "{Country} invites {Target} for diplomatic talks.",
    "{Country} criticizes {Target}'s stance on international issues.",
    "{Country} offers mediation in {Target}'s regional conflicts.",
    "{Country} opens embassy in {Target}'s capital.",
    "{Country} recalls ambassador from {Target} for consultations.",
    "{Country} proposes joint diplomatic initiatives with {Target}.",
    "{Country} expresses support for {Target}'s territorial claims.",
    "{Country} condemns {Target}'s actions in international forums.",
    "{Country} proposes confidence-building measures with {Target}.",
    "{Country} hosts diplomatic summit with {Target} representatives.",
    "{Country} freezes diplomatic relations with {Target}.",
    "{Country} offers asylum to dissidents from {Target}.",
    "{Country} proposes cultural exchange programs with {Target}.",
    "{Country} mediates border disputes between {Target} and neighbors.",
    "{Country} joins international coalition against {Target}'s policies.",
    "{Country} proposes bilateral security agreements with {Target}.",
    "{Country} expresses solidarity with {Target} on global issues.",
    "{Country} withdraws support for international sanctions against {Target}.",
    "{Country} proposes joint peacekeeping missions with {Target}.",
    "{Country} establishes diplomatic dialogue with {Target} factions.",
    "{Country} offers humanitarian aid through {Target}'s territory.",
    "{Country} proposes intelligence sharing agreements with {Target}.",
    "{Country} condemns human rights violations in {Target}.",
    "{Country} supports {Target}'s bid for international organization membership.",
    "{Country} proposes environmental cooperation with {Target}.",
    "{Country} establishes consular relations with {Target}.",
    "{Country} proposes joint border security measures with {Target}.",

    // Technological statements (30 templates)
    "{Country} announces a breakthrough in energy research.",
    "{Country} unveils new advancements in military technology.",
    "{Country} invests heavily in artificial intelligence development.",
    "{Country} shares technological expertise with {Target}.",
    "{Country} accelerates its space program development.",
    "{Country} pioneers new medical research initiatives.",
    "{Country} launches quantum computing research program.",
    "{Country} develops advanced renewable energy technologies.",
    "{Country} unveils new telecommunications infrastructure.",
    "{Country} advances in biotechnology research.",
    "{Country} launches national cybersecurity initiative.",
    "{Country} develops autonomous vehicle technology.",
    "{Country} pioneers 6G wireless communication standards.",
    "{Country} invests in nanotechnology research.",
    "{Country} advances in nuclear fusion technology.",
    "{Country} develops advanced materials for aerospace.",
    "{Country} launches artificial intelligence ethics framework.",
    "{Country} advances in gene editing technology.",
    "{Country} develops quantum encryption systems.",
    "{Country} invests in carbon capture technology.",
    "{Country} advances in robotics and automation.",
    "{Country} develops advanced weather prediction systems.",
    "{Country} pioneers blockchain technology applications.",
    "{Country} invests in virtual reality infrastructure.",
    "{Country} advances in pharmaceutical research.",
    "{Country} develops smart city technologies.",
    "{Country} launches digital currency initiative.",
    "{Country} advances in underwater exploration technology.",
    "{Country} develops advanced sensor networks.",
    "{Country} invests in educational technology platforms.",

    // Economic statements (30 templates)
    "{Country} plans to subsidize its heavy industry.",
    "{Country} announces new economic reforms.",
    "{Country} invests in infrastructure development.",
    "{Country} faces economic challenges due to global market shifts.",
    "{Country} expands its international trade network.",
    "{Country} implements new tax policies to boost growth.",
    "{Country} launches economic stimulus package.",
    "{Country} diversifies its export markets.",
    "{Country} invests in renewable energy infrastructure.",
    "{Country} reforms its banking sector.",
    "{Country} expands foreign direct investment abroad.",
    "{Country} implements austerity measures.",
    "{Country} launches digital transformation initiative.",
    "{Country} invests in human capital development.",
    "{Country} reforms its pension system.",
    "{Country} expands its manufacturing base.",
    "{Country} launches startup ecosystem development program.",
    "{Country} invests in transportation infrastructure.",
    "{Country} reforms agricultural policies.",
    "{Country} launches tourism promotion campaign.",
    "{Country} invests in healthcare infrastructure.",
    "{Country} reforms education system.",
    "{Country} expands mining operations.",
    "{Country} launches green energy transition plan.",
    "{Country} invests in research and development.",
    "{Country} reforms labor market policies.",
    "{Country} expands port and logistics infrastructure.",
    "{Country} launches consumer protection initiatives.",
    "{Country} invests in digital infrastructure.",
    "{Country} reforms financial regulatory framework.",

    // Strategic statements (30 templates)
    "{Country} strengthens alliances in the region.",
    "{Country} monitors {Target}'s activities closely.",
    "{Country} reevaluates its defense strategy.",
    "{Country} expands its intelligence network.",
    "{Country} develops contingency plans for regional instability.",
    "{Country} enhances border security measures.",
    "{Country} diversifies its energy sources.",
    "{Country} strengthens its position in international organizations.",
    "{Country} develops alternative trade routes.",
    "{Country} enhances its cyber defense capabilities.",
    "{Country} expands its diplomatic network.",
    "{Country} develops strategic partnerships in emerging markets.",
    "{Country} strengthens its maritime security.",
    "{Country} enhances its disaster response capabilities.",
    "{Country} develops strategic mineral reserves.",
    "{Country} expands its cultural influence abroad.",
    "{Country} strengthens its economic sovereignty.",
    "{Country} develops strategic food security measures.",
    "{Country} enhances its space situational awareness.",
    "{Country} strengthens its position in global supply chains.",
    "{Country} develops strategic water resource management.",
    "{Country} enhances its financial regulatory independence.",
    "{Country} strengthens its technological sovereignty.",
    "{Country} develops strategic partnerships in defense industry.",
    "{Country} enhances its global communication networks.",
    "{Country} strengthens its position in international law.",
    "{Country} develops strategic environmental policies.",
    "{Country} enhances its global humanitarian presence.",
    "{Country} strengthens its position in international standards.",
    "{Country} develops strategic partnerships in research.",

    // International relations (30 templates)
    "{Country} participates in international peacekeeping efforts.",
    "{Country} joins new international organizations.",
    "{Country} responds to global climate initiatives.",
    "{Country} addresses humanitarian concerns in neighboring regions.",
    "{Country} coordinates with allies on security matters.",
    "{Country} observes changing power dynamics in the region.",
    "{Country} contributes to international development aid.",
    "{Country} participates in global health initiatives.",
    "{Country} engages in international cultural exchanges.",
    "{Country} supports international disaster relief efforts.",
    "{Country} participates in global education programs.",
    "{Country} engages in international scientific collaboration.",
    "{Country} supports international environmental protection.",
    "{Country} participates in global cybersecurity cooperation.",
    "{Country} engages in international sports diplomacy.",
    "{Country} supports international refugee assistance.",
    "{Country} participates in global trade negotiations.",
    "{Country} engages in international legal cooperation.",
    "{Country} supports international women's rights initiatives.",
    "{Country} participates in global anti-corruption efforts.",
    "{Country} engages in international cultural heritage protection.",
    "{Country} supports international child welfare programs.",
    "{Country} participates in global food security initiatives.",
    "{Country} engages in international migration policy discussions.",
    "{Country} supports international indigenous rights.",
    "{Country} participates in global energy policy forums.",
    "{Country} engages in international labor standards discussions.",
    "{Country} supports international disability rights.",
    "{Country} participates in global tourism promotion.",
    "{Country} engages in international intellectual property cooperation."
  ];

  private rumorTemplates: string[] = [
    // Rumor templates (more speculative) - 50 templates
    "Rumors suggest {Country} is planning military action against {Target}.",
    "Intelligence reports indicate {Country} has secret negotiations with {Target}.",
    "Sources claim {Country} has made significant technological discoveries.",
    "Whispers of economic turmoil reach from {Country}'s capital.",
    "Diplomatic cables suggest {Country} is realigning its alliances.",
    "Market analysts predict major economic shifts in {Country}.",
    "Regional observers note unusual military movements in {Country}.",
    "Confidential reports detail {Country}'s covert operations.",
    "Whispers in diplomatic circles suggest {Country} is seeking new alliances.",
    "Unconfirmed reports claim {Country} has developed breakthrough military technology.",
    "Financial analysts speculate about {Country}'s upcoming economic reforms.",
    "Military observers report increased activity at {Country}'s borders.",
    "Sources suggest {Country} is expanding its intelligence operations.",
    "Rumors circulate about {Country}'s secret weapons program.",
    "Diplomatic sources hint at tensions between {Country} and {Target}.",
    "Economic indicators suggest {Country} is facing internal challenges.",
    "Satellite imagery shows unusual construction in {Country}.",
    "Sources claim {Country} has intercepted communications from {Target}.",
    "Market rumors suggest {Country} is preparing currency reforms.",
    "Military analysts note {Country}'s increased procurement activities.",
    "Diplomatic leaks suggest {Country} is planning territorial claims.",
    "Sources indicate {Country} has made diplomatic breakthroughs.",
    "Economic reports suggest {Country} is diversifying trade partners.",
    "Military sources claim {Country} has tested new defense systems.",
    "Diplomatic observers note {Country}'s changing foreign policy stance.",
    "Sources suggest {Country} is developing new energy technologies.",
    "Intelligence reports indicate {Country} has expanded cyber operations.",
    "Market speculation centers on {Country}'s infrastructure investments.",
    "Military rumors suggest {Country} is mobilizing reserve forces.",
    "Diplomatic sources hint at {Country}'s mediation efforts.",
    "Economic analysts predict {Country}'s upcoming budget announcements.",
    "Sources claim {Country} has achieved medical research breakthroughs.",
    "Military observers report {Country}'s naval fleet movements.",
    "Diplomatic rumors suggest {Country} is opening new embassies.",
    "Economic sources indicate {Country}'s foreign investment surge.",
    "Military sources claim {Country} has upgraded command structures.",
    "Diplomatic observers note {Country}'s increased international travel.",
    "Sources suggest {Country} is developing advanced AI capabilities.",
    "Economic reports hint at {Country}'s trade agreement negotiations.",
    "Military analysts note {Country}'s increased aerial reconnaissance.",
    "Diplomatic sources claim {Country} has resolved border disputes.",
    "Economic speculation focuses on {Country}'s mining expansions.",
    "Sources indicate {Country} has strengthened regional alliances.",
    "Military rumors suggest {Country}'s special forces deployments.",
    "Diplomatic observers report {Country}'s summit preparations.",
    "Economic analysts predict {Country}'s export market shifts.",
    "Sources claim {Country} has developed new surveillance technology.",
    "Military sources indicate {Country}'s logistics network expansions.",
    "Diplomatic rumors suggest {Country}'s changing diplomatic priorities.",
    "Economic sources hint at {Country}'s upcoming tax reforms.",
    "Sources suggest {Country} is preparing major scientific announcements.",
    "Military observers note {Country}'s increased coastal patrols.",
    "Diplomatic sources claim {Country} has established new trade routes.",
    "Economic speculation centers on {Country}'s startup ecosystem growth.",
    "Sources indicate {Country} has expanded humanitarian operations.",
    "Military rumors suggest {Country}'s advanced weapons testing.",
    "Diplomatic observers report {Country}'s international organization involvement."
  ];

  generateStatements(countries: Country[]): StatementEvent[] {
    if (countries.length < 2) {
      return [];
    }

    const events: StatementEvent[] = [];

    // Select 2 random countries (or all if fewer than 2)
    const selectedCountries = this.getRandomCountries(countries, 2);

    for (const country of selectedCountries) {
      // Generate 1 statement per country
      const countryStatement = this.generateStatementForCountry(country, countries);
      events.push(countryStatement);
    }

    return events;
  }

  private generateStatementForCountry(country: Country, allCountries: Country[]): StatementEvent {
    // Randomly choose between intent and rumor statement
    const isIntent = Math.random() < 0.6; // 60% chance for intent, 40% for rumor

    const template = isIntent
      ? this.getRandomTemplate(this.statementTemplates)
      : this.getRandomTemplate(this.rumorTemplates);

    // For statements, sometimes target another country
    const includeTarget = Math.random() < 0.7; // 70% chance to include a target country
    const message = this.populateTemplate(template, country, allCountries, includeTarget);

    return {
      type: isIntent ? 'statement.intent' : 'statement.rumor',
      message: message,
      data: {
        countryId: country.id,
        countryName: country.name,
        category: this.categorizeTemplate(template)
      }
    };
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