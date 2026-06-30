const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POLICIES_FILE = path.join(DATA_DIR, 'escalation_policies.json');
const LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');

// Helper to ensure data directory and files exist
function initStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Initial Mock Users
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
      {
        id: "u1",
        name: "Evelyn Carter",
        age: 82,
        streak: 5,
        missedCheckins: 0,
        riskStatus: "green", // green, yellow, red
        lastCheckinTime: new Date(Date.now() - 3600000 * 4).toISOString(), // 4 hrs ago
        lastCheckinText: "I'm doing well, had some nice tea and read my book this morning.",
        sentimentScore: 0.85
      },
      {
        id: "u2",
        name: "Arthur Pendelton",
        age: 79,
        streak: 8,
        missedCheckins: 0,
        riskStatus: "green",
        lastCheckinTime: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hrs ago
        lastCheckinText: "Hello there, my knee is a bit sore but otherwise I am fine.",
        sentimentScore: 0.65
      },
      {
        id: "u3",
        name: "Beatrice Vance",
        age: 85,
        streak: 12,
        missedCheckins: 0,
        riskStatus: "green",
        lastCheckinTime: new Date(Date.now() - 3600000 * 6).toISOString(), // 6 hrs ago
        lastCheckinText: "Splendid day! The volunteers helped me tidy up my porch.",
        sentimentScore: 0.95
      }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  }

  // Initial Mock Escalation Policies
  if (!fs.existsSync(POLICIES_FILE)) {
    const defaultPolicies = {
      "u1": {
        userId: "u1",
        userName: "Evelyn Carter",
        // Tier 1: Volunteer, Tier 2: Family, Tier 3: Family + Emergency
        riskThresholds: {
          yellow: 0.40, // Trigger Tier 1 / Yellow Alert
          red: 0.70    // Trigger Tier 2 / Red Alert
        },
        contacts: {
          volunteer: {
            name: "Dave Miller (Volunteer Coordinator)",
            phone: "+15550199",
            email: "dave.volunteer@example.com",
            channel: "email"
          },
          family1: {
            name: "Sarah Carter (Daughter)",
            phone: "+15550188",
            email: "sarah.carter@example.com",
            channel: "sms"
          },
          family2: null,
          emergency: {
            name: "County EMS Dispatch",
            phone: "911",
            email: "dispatch@county-ems.org",
            channel: "call"
          }
        },
        // Which tier of contact to notify for which status
        routing: {
          yellow: ["volunteer"],
          red: ["family1"]
        }
      },
      "u2": {
        userId: "u2",
        userName: "Arthur Pendelton",
        riskThresholds: {
          yellow: 0.35,
          red: 0.60
        },
        contacts: {
          volunteer: {
            name: "Dave Miller (Volunteer Coordinator)",
            phone: "+15550199",
            email: "dave.volunteer@example.com",
            channel: "email"
          },
          family1: {
            name: "Robert Pendelton (Son)",
            phone: "+15550277",
            email: "robert.p@example.com",
            channel: "email"
          },
          family2: {
            name: "Martha Pendelton (Sister)",
            phone: "+15550288",
            email: "martha.p@example.com",
            channel: "sms"
          },
          emergency: {
            name: "County EMS Dispatch",
            phone: "911",
            email: "dispatch@county-ems.org",
            channel: "call"
          }
        },
        routing: {
          yellow: ["volunteer", "family1"],
          red: ["volunteer", "family1", "family2", "emergency"]
        }
      },
      "u3": {
        userId: "u3",
        userName: "Beatrice Vance",
        riskThresholds: {
          yellow: 0.30,
          red: 0.65
        },
        contacts: {
          volunteer: {
            name: "Dave Miller (Volunteer Coordinator)",
            phone: "+15550199",
            email: "dave.volunteer@example.com",
            channel: "sms"
          },
          family1: null,
          family2: null,
          emergency: {
            name: "County EMS Dispatch",
            phone: "911",
            email: "dispatch@county-ems.org",
            channel: "call"
          }
        },
        routing: {
          yellow: ["volunteer"],
          red: ["volunteer", "emergency"]
        }
      }
    };
    fs.writeFileSync(POLICIES_FILE, JSON.stringify(defaultPolicies, null, 2));
  }

  // Initial Mock logs
  if (!fs.existsSync(LOGS_FILE)) {
    const defaultLogs = [
      {
        id: "l_init",
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        userId: "u1",
        userName: "Evelyn Carter",
        agent: "Care Coordinator Agent",
        action: "SYSTEM_INITIALIZATION",
        status: "success",
        details: "Porchlight system initialized. Volunteer and family networks configured for user.",
        escalationTriggered: false
      }
    ];
    fs.writeFileSync(LOGS_FILE, JSON.stringify(defaultLogs, null, 2));
  }
}

// Ensure database files are set up when imported
initStore();

function readJSON(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return [];
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

module.exports = {
  getUsers: () => readJSON(USERS_FILE),
  saveUsers: (users) => writeJSON(USERS_FILE, users),
  getPolicies: () => readJSON(POLICIES_FILE),
  savePolicies: (policies) => writeJSON(POLICIES_FILE, policies),
  getLogs: () => readJSON(LOGS_FILE),
  saveLogs: (logs) => writeJSON(LOGS_FILE, logs),
  
  // Helper to log agent decision
  addLog: (logEntry) => {
    const logs = readJSON(LOGS_FILE);
    const newEntry = {
      id: "l_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      ...logEntry
    };
    logs.unshift(newEntry); // Newest logs first
    writeJSON(LOGS_FILE, logs);
    return newEntry;
  }
};
