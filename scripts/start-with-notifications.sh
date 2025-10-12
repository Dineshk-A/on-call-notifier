#!/bin/bash

# Start Redis On-Call System with Slack Notifications
# This script starts both the React app and the notification server

echo "🚀 Starting Redis On-Call System with Slack Notifications"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing server dependencies..."
cd server
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..

echo "📦 Installing React app dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
fi

# Copy production files to public folder if they don't exist
if [ ! -f "public/production/redis-sre/schedule/schedule.yaml" ]; then
    echo "📋 Creating public production directory and copying files..."
    mkdir -p public/production/redis-sre/schedule public/production/redis-sre/teams
    cp production/redis-sre/schedule/schedule.yaml public/production/redis-sre/schedule/
    cp production/redis-sre/teams/teams.yaml public/production/redis-sre/teams/
fi

echo "🔧 Starting notification server on port 3001..."
cd server
npm start &
SERVER_PID=$!
cd ..

# Wait a moment for server to start
sleep 3

echo "🌐 Starting React app on port 3000..."
npm start &
REACT_PID=$!

echo ""
echo "✅ Both services are starting up!"
echo "📊 React App: http://localhost:3000"
echo "🔔 Notification Server: http://localhost:3001"
echo "📈 Server Status: http://localhost:3001/api/status"
echo ""
echo "Press Ctrl+C to stop both services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $SERVER_PID 2>/dev/null
    kill $REACT_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
