// Note: sqlite3 should be installed in the server directory
let sqlite3;
try {
  sqlite3 = require('../../server/node_modules/sqlite3').verbose();
} catch (error) {
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch (error2) {
    console.error('❌ SQLite3 not found. Please run: cd server && npm install sqlite3');
    process.exit(1);
  }
}
const path = require('path');
const fs = require('fs');

class HistoryService {
  constructor() {
    this.dbPath = path.join(__dirname, '../../data/history.db');
    this.db = null;
    this.initDatabase();
  }

  /**
   * Initialize SQLite database with required tables
   */
  async initDatabase() {
    return new Promise(async (resolve, reject) => {
      try {
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('❌ Failed to open database:', err);
            reject(err);
            return;
          }
        });

        // Create tables and wait for completion
        await this.createTables();
        console.log('✅ History database initialized');
        resolve();
      } catch (error) {
        console.error('❌ Failed to initialize history database:', error);
        reject(error);
      }
    });
  }

  /**
   * Create database tables for historical data
   */
  createTables() {
    return new Promise((resolve, reject) => {
      const tables = [
        // Schedule versions table
        `CREATE TABLE IF NOT EXISTS schedule_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version_name TEXT NOT NULL,
          effective_date TEXT NOT NULL,
          schedule_data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT DEFAULT 'system',
          description TEXT,
          is_active INTEGER DEFAULT 1
        )`,

        // Historical assignments table (immutable once created)
        `CREATE TABLE IF NOT EXISTS historical_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          layer_key TEXT NOT NULL,
          person TEXT NOT NULL,
          version_id INTEGER NOT NULL,
          override_id INTEGER NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (version_id) REFERENCES schedule_versions (id),
          UNIQUE(date, layer_key)
        )`,

        // Monthly overrides table
        `CREATE TABLE IF NOT EXISTS monthly_overrides (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL,
          override_data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,

        // Metadata table for system info
        `CREATE TABLE IF NOT EXISTS system_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ];

      let completed = 0;
      tables.forEach((sql, index) => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error(`Error creating table ${index}:`, err);
            reject(err);
            return;
          }
          completed++;
          if (completed === tables.length) {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Create a new schedule version
   */
  async createScheduleVersion(scheduleData, effectiveDate, description = null, createdBy = 'system') {
    return new Promise((resolve, reject) => {
      const versionName = `v${Date.now()}`;
      const now = new Date().toISOString();
      
      const sql = `INSERT INTO schedule_versions 
        (version_name, effective_date, schedule_data, created_at, created_by, description) 
        VALUES (?, ?, ?, ?, ?, ?)`;
      
      this.db.run(sql, [
        versionName,
        effectiveDate,
        JSON.stringify(scheduleData),
        now,
        createdBy,
        description
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        console.log(`✅ Created schedule version ${versionName} (ID: ${this.lastID})`);
        resolve({
          id: this.lastID,
          versionName,
          effectiveDate,
          createdAt: now
        });
      });
    });
  }

  /**
   * Get the correct schedule version for a specific date
   */
  async getScheduleForDate(targetDate) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM schedule_versions 
        WHERE effective_date <= ? AND is_active = 1 
        ORDER BY effective_date DESC 
        LIMIT 1`;
      
      this.db.get(sql, [targetDate], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          resolve({
            ...row,
            schedule_data: JSON.parse(row.schedule_data)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Store historical assignment (immutable once created)
   */
  async storeHistoricalAssignment(date, layerKey, person, versionId, overrideId = null) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      const sql = `INSERT OR IGNORE INTO historical_assignments 
        (date, layer_key, person, version_id, override_id, created_at) 
        VALUES (?, ?, ?, ?, ?, ?)`;
      
      this.db.run(sql, [date, layerKey, person, versionId, overrideId, now], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes > 0) {
          console.log(`✅ Stored historical assignment: ${date} ${layerKey} → ${person}`);
        }
        resolve(this.lastID);
      });
    });
  }

  /**
   * Get historical assignment for a specific date and layer
   */
  async getHistoricalAssignment(date, layerKey) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM historical_assignments 
        WHERE date = ? AND layer_key = ?`;
      
      this.db.get(sql, [date, layerKey], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }

  /**
   * Store monthly overrides
   */
  async storeMonthlyOverrides(month, overrideData) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      const sql = `INSERT OR REPLACE INTO monthly_overrides 
        (month, override_data, created_at, updated_at) 
        VALUES (?, ?, COALESCE((SELECT created_at FROM monthly_overrides WHERE month = ?), ?), ?)`;
      
      this.db.run(sql, [
        month, 
        JSON.stringify(overrideData), 
        month, 
        now, 
        now
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        console.log(`✅ Stored overrides for ${month}`);
        resolve(this.lastID);
      });
    });
  }

  /**
   * Get overrides for a specific month
   */
  async getMonthlyOverrides(month) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM monthly_overrides WHERE month = ?`;
      
      this.db.get(sql, [month], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          resolve({
            ...row,
            override_data: JSON.parse(row.override_data)
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Cleanup old data (older than specified months)
   */
  async cleanupOldData(monthsToKeep = 6) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
    const cutoffMonth = cutoffDate.toISOString().substring(0, 7); // YYYY-MM
    const cutoffDay = cutoffDate.toISOString().substring(0, 10); // YYYY-MM-DD

    try {
      // Clean old assignments (compare full date correctly)
      await new Promise((resolve, reject) => {
        this.db.run(`DELETE FROM historical_assignments WHERE date < ?`,
          [cutoffDay], function(err) {
            if (err) reject(err);
            else {
              console.log(`🧹 Cleaned ${this.changes} old historical assignments (< ${cutoffDay})`);
              resolve();
            }
          });
      });

      // Clean old overrides (month granularity)
      await new Promise((resolve, reject) => {
        this.db.run(`DELETE FROM monthly_overrides WHERE month < ?`,
          [cutoffMonth], function(err) {
            if (err) reject(err);
            else {
              console.log(`🧹 Cleaned ${this.changes} old monthly overrides (< ${cutoffMonth})`);
              resolve();
            }
          });
      });

      // Mark old schedule versions as inactive (don't delete for audit trail)
      await new Promise((resolve, reject) => {
        this.db.run(`UPDATE schedule_versions SET is_active = 0 WHERE effective_date < ?`,
          [cutoffDay], function(err) {
            if (err) reject(err);
            else {
              console.log(`🧹 Marked ${this.changes} old schedule versions as inactive (< ${cutoffDay})`);
              resolve();
            }
          });
      });

    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('📦 History database connection closed');
    }
  }
}

module.exports = HistoryService;
