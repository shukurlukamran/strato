# Strato - Political Strategy Game

A web-based turn-based strategy game where players manage a country competing with AI-controlled countries. Features chat-based diplomacy, complex economic systems, and intelligent AI opponents.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router) with TypeScript
- **Backend**: Supabase (PostgreSQL database, Auth, Realtime)
- **Deployment**: Vercel
- **State Management**: Zustand
- **AI**: Custom decision engine with LLM integration for chat-based diplomacy

## Features

- **Chat-Based Diplomacy**: Negotiate deals through free-form conversation with AI countries
- **Strategic AI**: Intelligent AI opponents that act in their country's best interests
- **Complex Game Systems**: Resources, technology, military, economy, and population management
- **Deal System**: Structured deal proposals with confirmation workflow
- **Scalable Architecture**: Designed to support many countries and future multiplayer

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- Vercel account (for deployment)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/shukurlukamran/strato.git
cd strato
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.local.example .env.local
```

Fill in your Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (server-side only)

4. Set up Supabase database:
```bash
# Link to your Supabase project
npx supabase link --project-ref your-project-ref

# Run migrations
npx supabase db push
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the game.

## Project Structure

```
strato/
├── app/                    # Next.js App Router
│   ├── (game)/            # Game routes
│   ├── api/               # API routes
│   └── page.tsx           # Landing page
├── components/            # React components
│   └── game/              # Game-specific components
├── lib/                   # Core libraries
│   ├── game-engine/       # Game logic
│   ├── ai/                # AI system
│   └── supabase/          # Supabase client
├── types/                 # TypeScript definitions
└── supabase/              # Database migrations
    └── migrations/        # SQL migration files
```

## Deployment

### Vercel

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

The app will automatically deploy on every push to main.

## Development Roadmap

- [x] Core game engine and state management
- [x] Database schema and migrations
- [x] Basic UI components
- [x] Chat-based diplomacy system
- [ ] AI chat handler with LLM integration
- [ ] Turn processing and game mechanics
- [ ] Advanced AI decision making
- [ ] Multiplayer support
- [ ] World map visualization

## License

MIT
