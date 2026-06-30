const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./data-store');
const security = require('./security');
const coordinator = require('./agents/coordinator-agent');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve frontend static build files if they exist
const frontendBuildPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendBuildPath));

// API: Get monitored users list
app.get('/api/users', (req, res) => {
  try {
    const users = db.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve users", details: err.message });
  }
});

// API: Get audit/decision logs
app.get('/api/logs', (req, res) => {
  try {
    const logs = db.getLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve logs", details: err.message });
  }
});

// API: Get escalation policies
app.get('/api/policies', (req, res) => {
  try {
    const policies = db.getPolicies();
    res.json(policies);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve policies", details: err.message });
  }
});

// API: Get specific user's policy
app.get('/api/policies/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const policies = db.getPolicies();
    const policy = policies[userId];
    if (!policy) {
      return res.status(404).json({ error: "Policy not found for user: " + userId });
    }
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve policy", details: err.message });
  }
});

// API: Update user's policy (Enforces X-Porchlight-Auth security)
app.put('/api/policies/:userId', security.authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const newPolicy = req.body;

    // Security Check: Input validation
    const validation = security.validateEscalationPolicy(newPolicy);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Validation Failed",
        errors: validation.errors
      });
    }

    const policies = db.getPolicies();
    
    // Maintain userId coupling
    newPolicy.userId = userId;
    policies[userId] = newPolicy;
    
    db.savePolicies(policies);

    // Write audit log
    db.addLog({
      userId,
      userName: newPolicy.userName || "Unknown",
      agent: "Care Coordinator Agent",
      action: "UPDATE_POLICY",
      status: "success",
      details: `Escalation policy modified by administrator. Channels: [volunteer: ${newPolicy.contacts.volunteer?.channel}, family1: ${newPolicy.contacts.family1?.channel}].`,
      escalationTriggered: false
    });

    res.json({ message: "Policy updated successfully", policy: newPolicy });
  } catch (err) {
    res.status(500).json({ error: "Failed to update policy", details: err.message });
  }
});

// API: Simulate check-in submission
app.post('/api/checkin', (req, res) => {
  try {
    const { userId, text, mockScore } = req.body;

    // Security check: Validate fields
    const validation = security.validateCheckin(userId, text);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Validation Failed",
        errors: validation.errors
      });
    }

    const result = coordinator.processCheckin(userId, text, mockScore);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error("Check-in processing error:", err);
    res.status(500).json({ error: "Failed to process check-in", details: err.message });
  }
});

// API: Simulate missed check-in trigger
app.post('/api/missed-checkin', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: "userId is required." });
    }

    const result = coordinator.processMissedCheckin(userId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error("Missed check-in error:", err);
    res.status(500).json({ error: "Failed to process missed check-in", details: err.message });
  }
});

// API: Reset DB to default state (Helper for demo environments)
app.post('/api/reset', (req, res) => {
  try {
    const fs = require('fs');
    const dataDir = path.join(__dirname, 'data');
    
    // Delete files so initialization in data-store.js recreates them
    const files = ['users.json', 'escalation_policies.json', 'audit_logs.json'];
    files.forEach(f => {
      const p = path.join(dataDir, f);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });

    // Re-initialize by re-requiring (or referencing) the store
    // This is clean and resets the database values instantly
    delete require.cache[require.resolve('./data-store')];
    const newDb = require('./data-store');

    res.json({ message: "Database reset to original demonstration states successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset database", details: err.message });
  }
});

// Serve frontend SPA fallback for undefined routes
app.get('*', (req, res) => {
  // If Vite has built, send index.html, else return message
  const indexHtml = path.join(frontendBuildPath, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.send("Porchlight Backend API is running on Port 3000. Build frontend using 'npm run build' to serve the UI from here.");
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global express error:", err);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(` Porchlight AI Care System Server Running On:   `);
  console.log(` http://localhost:${PORT}                        `);
  console.log(`================================================`);
});
