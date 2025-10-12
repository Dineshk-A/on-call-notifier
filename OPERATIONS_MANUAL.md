# Redis On-Call Notifier - Operations Manual

## 🚀 Quick Start Commands

### **Starting the System**
```bash
# Terminal 1 - Start UI Server (React)
npm start

# Terminal 2 - Start Notification Server (Backend)
cd server && npm start
```

### **Stopping the System**
```bash
# Method 1: Graceful shutdown (in each terminal)
Ctrl+C

# Method 2: Kill processes by port
lsof -ti:3000 | xargs kill -9  # Kill UI server
lsof -ti:3001 | xargs kill -9  # Kill notification server

# Method 3: Kill by process name
pkill -f "react-scripts"       # Kill UI server
pkill -f "notificationServer"  # Kill notification server
```

---

## 📁 File Structure & Configuration

### **Configuration Files (Single Source of Truth)**
```
public/redis-sre/
├── schedule/
│   └── schedule.yaml          ← Main schedule configuration
├── teams/
│   └── teams.yaml            ← Team member information
└── overrides/
    └── overrides.json        ← Manual shift overrides
```

### **Making Schedule Changes**
```bash
# 1. Edit the schedule file
vim public/redis-sre/schedule/schedule.yaml

# 2. Restart notification server (UI auto-reloads)
cd server && npm start

# 3. Verify changes
curl -X POST http://localhost:3001/api/send-test-notification
```

---

## 🗄️ Database Operations (SQLite)

### **Database Location**
```bash
# Database file location
data/history.db
```

### **Connecting to Database**
```bash
# Install SQLite CLI (if not installed)
brew install sqlite3  # macOS
sudo apt install sqlite3  # Ubuntu

# Connect to database
sqlite3 data/history.db

# Basic SQLite commands inside the database:
.help                    # Show all commands
.tables                  # List all tables
.schema                  # Show table schemas
.quit                    # Exit database
```

### **Common Database Queries**
```sql
-- View all schedule versions
SELECT * FROM schedule_versions ORDER BY created_at DESC;

-- View historical assignments for a specific date
SELECT * FROM historical_assignments WHERE date = '2025-09-29';

-- View monthly overrides
SELECT * FROM monthly_overrides ORDER BY month DESC;

-- Count total assignments
SELECT COUNT(*) FROM historical_assignments;

-- View version history with descriptions
SELECT version_name, effective_date, description, created_by, created_at 
FROM schedule_versions 
ORDER BY created_at DESC 
LIMIT 10;
```

### **Database Maintenance**
```sql
-- Check database size
.dbinfo

-- Vacuum database (optimize storage)
VACUUM;

-- Check table info
.schema schedule_versions

-- Export data to CSV
.mode csv
.output assignments.csv
SELECT * FROM historical_assignments;
.output stdout
```

---

## 🔧 API Endpoints

### **System Status**
```bash
# Check server status
curl http://localhost:3001/api/status

# Health check
curl http://localhost:3001/health

# Test notification
curl -X POST http://localhost:3001/api/send-test-notification
```

### **Historical Data APIs**
```bash
# Get assignment for specific date and layer
curl http://localhost:3001/api/history/assignment/2025-09-29/layer1

# Get schedule version for specific date
curl http://localhost:3001/api/history/schedule/2025-09-29

# Get version history
curl http://localhost:3001/api/history/versions

# Create new version manually
curl -X POST http://localhost:3001/api/history/create-version \
  -H "Content-Type: application/json" \
  -d '{"description": "Manual version", "createdBy": "admin"}'

# Cleanup old data (keep 6 months)
curl -X POST http://localhost:3001/api/history/cleanup \
  -H "Content-Type: application/json" \
  -d '{"monthsToKeep": 6}'
```

---

## 🛠️ Troubleshooting

### **Common Issues**

#### **Port Already in Use**
```bash
# Problem: EADDRINUSE error
# Solution: Kill existing processes
lsof -ti:3001 | xargs kill -9
cd server && npm start
```

#### **Schedule Changes Not Reflecting**
```bash
# Problem: UI not showing changes
# Solution: Restart notification server
cd server && npm start
# UI will auto-reload
```

#### **Database Errors**
```bash
# Problem: SQLite errors
# Solution: Check database file permissions
ls -la data/history.db
chmod 664 data/history.db

# Recreate database if corrupted
rm data/history.db
cd server && npm start  # Will recreate automatically
```

#### **Module Not Found Errors**
```bash
# Problem: Missing dependencies
# Solution: Reinstall packages
npm install              # For UI dependencies
cd server && npm install # For server dependencies
```

---

## 📊 Monitoring & Logs

### **Server Logs**
```bash
# View real-time server logs
cd server && npm start

# Key log indicators:
✅ "History database initialized"     # Database ready
✅ "Versioned schedule service initialized"  # Historical system ready
✅ "Shift scheduler started automatically"   # Notifications active
❌ "SQLITE_ERROR"                     # Database issues
❌ "Failed to load schedule"          # Configuration issues
```

### **System Health Checks**
```bash
# Check if both servers are running
ps aux | grep node
ps aux | grep react-scripts

# Check port usage
lsof -i :3000  # UI server
lsof -i :3001  # Notification server

# Test API connectivity
curl -s http://localhost:3001/health | jq .
```

---

## 🔄 Backup & Recovery

### **Backup Important Files**
```bash
# Create backup directory
mkdir -p backups/$(date +%Y-%m-%d)

# Backup configuration
cp -r public/redis-sre/ backups/$(date +%Y-%m-%d)/

# Backup database
cp data/history.db backups/$(date +%Y-%m-%d)/

# Backup entire project (optional)
tar -czf backups/redis-oncall-$(date +%Y-%m-%d).tar.gz \
  --exclude=node_modules \
  --exclude=build \
  --exclude=.git \
  .
```

### **Recovery**
```bash
# Restore configuration
cp -r backups/2025-09-29/redis-sre/ public/

# Restore database
cp backups/2025-09-29/history.db data/

# Restart services
cd server && npm start
```

---

## 🎯 Best Practices

### **Schedule Management**
1. **Always make changes 1 day ahead** (PagerDuty style)
2. **Test changes** with test notification before going live
3. **Document changes** in version descriptions
4. **Backup before major changes**

### **Database Management**
1. **Regular cleanup** (monthly) to prevent database bloat
2. **Monitor database size** and performance
3. **Backup before cleanup operations**
4. **Use version descriptions** for audit trail

### **System Maintenance**
1. **Monitor logs** for errors and warnings
2. **Keep dependencies updated** regularly
3. **Test notification system** weekly
4. **Verify timezone conversions** after changes

---

*This operations manual covers all essential commands and procedures for managing the Redis On-Call Notifier system.*
