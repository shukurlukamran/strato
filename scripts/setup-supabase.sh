#!/bin/bash

# Supabase Setup Script for Strato
# This script helps link your local project to Supabase and push migrations

set -e

echo "🚀 Strato Supabase Setup"
echo "========================"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠️  .env.local not found. Creating from template..."
    cp env.local.example .env.local
    echo "✅ Created .env.local. Please fill in your Supabase credentials."
    echo ""
fi

# Prompt for project ref
read -p "Enter your Supabase Project Reference ID: " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Project Reference ID is required!"
    exit 1
fi

echo ""
echo "🔗 Linking to Supabase project..."
npx supabase link --project-ref "$PROJECT_REF"

echo ""
echo "📦 Pushing database schema..."
npx supabase db push

echo ""
echo "✅ Supabase setup complete!"
echo ""
echo "Next steps:"
echo "1. Make sure your .env.local file has all required variables"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Visit http://localhost:3000 to see your game"
