#!/usr/bin/env bash
# scripts/run-backfill.sh
# 
# Complete backfill runner for PTEC E-Library:
# 1. Extracts PDF text into `book_pages` (and updates `resource_index_state`)
# 2. Generates semantic embeddings for records & passages into `book_chunks`
#
# Usage:
#   ./scripts/run-backfill.sh            # Run standard backfill (only unindexed/missing records)
#   ./scripts/run-backfill.sh --all      # Force re-extraction and re-embedding for everything

set -euo pipefail

# Navigate to project root
cd "$(dirname "$0")/.."

echo "=================================================="
echo "📚 PTEC E-Library - Full Discovery Backfill Runner"
echo "=================================================="
echo ""

# Check environment files
if [ ! -f .env.local ] && [ ! -f .env ]; then
  echo "❌ Error: Neither .env.local nor .env found in the project root."
  echo "   Please make sure your database credentials and API keys are set."
  exit 1
fi

FLAGS=("$@")

echo "👉 Step 1: Extracting PDF pages (extract-pdf-text.ts)..."
echo "   This extracts per-page text from PDFs into 'book_pages'."
echo "   Idempotent: skips already indexed books unless '--all' is provided."
echo "--------------------------------------------------"
npx tsx scripts/extract-pdf-text.ts "${FLAGS[@]}"

echo ""
echo "👉 Step 2: Generating Embeddings (embed-library.ts)..."
echo "   This creates row-level embeddings and chunk embeddings in 'book_chunks'."
echo "   Note: Gemini Free Tier has daily rate limits. If it hits the quota,"
echo "   simply re-run this script tomorrow to resume where it left off."
echo "--------------------------------------------------"
npx tsx scripts/embed-library.ts "${FLAGS[@]}"

echo ""
echo "=================================================="
echo "✅ Backfill process finished!"
echo "=================================================="
echo "To verify the status in Supabase SQL Editor:"
echo "  SELECT * FROM public_resource_index_health;"
echo "  SELECT record_type, status, COUNT(*) FROM resource_index_state GROUP BY 1, 2;"
echo "=================================================="
