#!/bin/bash

# Redis On-Call Notifier - Production Sync Script
# This script syncs production files to public folder for frontend access

echo "🏢 Syncing production files..."

# Create public production directory structure
mkdir -p public/production/redis-sre/schedule
mkdir -p public/production/redis-sre/teams

# Copy production files
echo "📋 Copying schedule.yaml..."
cp production/redis-sre/schedule/schedule.yaml public/production/redis-sre/schedule/

echo "👥 Copying teams.yaml..."
cp production/redis-sre/teams/teams.yaml public/production/redis-sre/teams/

echo "✅ Production sync complete!"
echo ""
echo "📁 Files synced:"
echo "   production/redis-sre/schedule/schedule.yaml → public/production/redis-sre/schedule/"
echo "   production/redis-sre/teams/teams.yaml → public/production/redis-sre/teams/"
echo ""
echo "💡 Remember: Edit files in production/ directory, not public/production/"
