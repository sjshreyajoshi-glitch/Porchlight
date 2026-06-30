#!/usr/bin/env node

/**
 * Porchlight CLI Simulation & Diagnostic Tool
 */

const path = require('path');
const db = require('./backend/data-store');
const coordinator = require('./backend/agents/coordinator-agent');
const escalationAgent = require('./backend/agents/escalation-agent');
const security = require('./backend/security');

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

// Map command executions
switch (command) {
  case 'checkin':
    handleCheckin();
    break;
  case 'checkin-mock':
    handleCheckinMock();
    break;
  case 'missed':
    handleMissed();
    break;
  case 'trigger':
    handleTrigger();
    break;
  case 'logs':
    handleLogs();
    break;
  case 'policies':
    handlePolicies();
    break;
  case 'users':
    handleUsers();
    break;
  default:
    console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
\x1b[33mPorchlight AI Caregiver CLI Tool\x1b[0m
Usage: node cli.js <command> [arguments]

Commands:
  \x1b[36musers\x1b[0m                                 List all monitored elderly users and current risk levels.
  \x1b[36mpolicies\x1b[0m                              List the personalized escalation policies for all users.
  \x1b[36mcheckin <userId> "<message>"\x1b[0m          Simulate a standard text check-in for a user.
  \x1b[36mcheckin-mock <userId> "<message>" <score>\x1b[0m Simulate a text check-in with a manually injected sentiment score (0.0 to 1.0).
  \x1b[36mmissed <userId>\x1b[0m                       Simulate a missed check-in event (breaks streak, increases risk).
  \x1b[36mtrigger <userId> <yellow|red> "<reason>"\x1b[0m Force a test escalation trigger and log the notifications.
  \x1b[36mlogs [count]\x1b[0m                          Display the latest agent decision logs and notifications.

Examples:
  node cli.js checkin u1 "I feel great today, walked around the block."
  node cli.js checkin-mock u1 "I had a fall in the kitchen and my leg hurts." 0.15
  node cli.js missed u2
  node cli.js logs 5
`);
}

function handleUsers() {
  const users = db.getUsers();
  console.log('\n\x1b[1mPorchlight Monitored Residents:\x1b[0m');
  console.log('----------------------------------------------------');
  users.forEach(u => {
    const color = u.riskStatus === 'red' ? '\x1b[31m' : u.riskStatus === 'yellow' ? '\x1b[33m' : '\x1b[32m';
    console.log(`ID: \x1b[36m${u.id}\x1b[0m | Name: \x1b[1m${u.name}\x1b[0m (Age ${u.age}) | Streak: ${u.streak}d | Missed: ${u.missedCheckins} | Risk: ${color}${u.riskStatus.toUpperCase()}\x1b[0m`);
    console.log(`  Last Checkin: "${u.lastCheckinText || 'None'}" (Score: ${u.sentimentScore?.toFixed(2) || 'N/A'})\n`);
  });
}

function handlePolicies() {
  const policies = db.getPolicies();
  console.log('\n\x1b[1mPersonalized Escalation Policies:\x1b[0m');
  console.log('----------------------------------------------------');
  Object.keys(policies).forEach(id => {
    const p = policies[id];
    console.log(`User: \x1b[1m${p.userName}\x1b[0m (\x1b[36m${p.userId}\x1b[0m)`);
    console.log(`  Thresholds -> Yellow: ${p.riskThresholds.yellow} | Red: ${p.riskThresholds.red}`);
    console.log(`  Routing    -> Yellow Alert Alerts: [${p.routing.yellow.join(', ')}]`);
    console.log(`             -> Red Alert Alerts:    [${p.routing.red.join(', ')}]`);
    console.log(`  Contacts:`);
    Object.keys(p.contacts).forEach(key => {
      const c = p.contacts[key];
      if (c) {
        console.log(`    - [${key.toUpperCase()}] ${c.name} (${c.channel.toUpperCase()}: ${c.channel === 'email' ? c.email : c.phone})`);
      }
    });
    console.log('');
  });
}

function handleCheckin() {
  const userId = args[1];
  const text = args[2];

  if (!userId || !text) {
    console.error('\x1b[31mError: Missing arguments. Usage: node cli.js checkin <userId> "<message>"\x1b[0m');
    process.exit(1);
  }

  const validation = security.validateCheckin(userId, text);
  if (!validation.valid) {
    console.error(`\x1b[31mValidation Error: ${validation.errors.join(', ')}\x1b[0m`);
    process.exit(1);
  }

  console.log(`Processing check-in for user ${userId} using Sentiment NLP rules...`);
  const result = coordinator.processCheckin(userId, text);
  
  if (result.success) {
    const user = result.user;
    console.log(`\n\x1b[32m✔ Check-in Logged Successfully\x1b[0m`);
    console.log(`Resident: ${user.name}`);
    console.log(`New Streak: ${user.streak} days`);
    console.log(`Calculated Sentiment: ${user.sentimentScore.toFixed(2)}`);
    console.log(`Risk Status: ${user.riskStatus.toUpperCase()}`);
    if (result.escalation.escalationTriggered) {
      console.log(`\x1b[31m⚠ Escalation Triggered! Notifications sent: ${result.escalation.notifications.length}\x1b[0m`);
    }
  } else {
    console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
  }
}

function handleCheckinMock() {
  const userId = args[1];
  const text = args[2];
  const scoreStr = args[3];

  if (!userId || !text || !scoreStr) {
    console.error('\x1b[31mError: Missing arguments. Usage: node cli.js checkin-mock <userId> "<message>" <score>\x1b[0m');
    process.exit(1);
  }

  const score = parseFloat(scoreStr);
  if (isNaN(score) || score < 0 || score > 1) {
    console.error('\x1b[31mError: Score must be a float between 0.0 and 1.0\x1b[0m');
    process.exit(1);
  }

  const validation = security.validateCheckin(userId, text);
  if (!validation.valid) {
    console.error(`\x1b[31mValidation Error: ${validation.errors.join(', ')}\x1b[0m`);
    process.exit(1);
  }

  console.log(`Processing check-in for user ${userId} forcing mock sentiment score ${score}...`);
  const result = coordinator.processCheckin(userId, text, score);
  
  if (result.success) {
    const user = result.user;
    console.log(`\n\x1b[32m✔ Check-in Logged Successfully (MOCK MODE)\x1b[0m`);
    console.log(`Resident: ${user.name}`);
    console.log(`Calculated Sentiment: ${user.sentimentScore.toFixed(2)}`);
    console.log(`Risk Status: ${user.riskStatus.toUpperCase()}`);
    if (result.escalation.escalationTriggered) {
      console.log(`\x1b[31m⚠ Escalation Triggered! Notifications sent: ${result.escalation.notifications.length}\x1b[0m`);
    }
  } else {
    console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
  }
}

function handleMissed() {
  const userId = args[1];
  if (!userId) {
    console.error('\x1b[31mError: Missing arguments. Usage: node cli.js missed <userId>\x1b[0m');
    process.exit(1);
  }

  console.log(`Logging missed check-in for user ${userId}...`);
  const result = coordinator.processMissedCheckin(userId);
  
  if (result.success) {
    const user = result.user;
    console.log(`\n\x1b[33m✔ Missed Check-in Processed\x1b[0m`);
    console.log(`Resident: ${user.name}`);
    console.log(`Consecutive Missed: ${user.missedCheckins}`);
    console.log(`Streak Reset: 0 days`);
    console.log(`Risk Status: ${user.riskStatus.toUpperCase()}`);
    if (result.escalation.escalationTriggered) {
      console.log(`\x1b[31m⚠ Escalation Triggered! Notifications sent: ${result.escalation.notifications.length}\x1b[0m`);
    }
  } else {
    console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
  }
}

function handleTrigger() {
  const userId = args[1];
  const riskLevel = args[2];
  const reason = args[3];

  if (!userId || !riskLevel || !reason) {
    console.error('\x1b[31mError: Missing arguments. Usage: node cli.js trigger <userId> <yellow|red> "<reason>"\x1b[0m');
    process.exit(1);
  }

  if (riskLevel !== 'yellow' && riskLevel !== 'red') {
    console.error('\x1b[31mError: Risk level must be "yellow" or "red"\x1b[0m');
    process.exit(1);
  }

  const users = db.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    console.error(`\x1b[31mUser not found: ${userId}\x1b[0m`);
    process.exit(1);
  }

  user.riskStatus = riskLevel;
  db.saveUsers(users);

  const score = riskLevel === 'red' ? 0.10 : 0.45;
  const escalationResult = escalationAgent.evaluateEscalation(userId, score, user.missedCheckins);

  db.addLog({
    userId,
    userName: user.name,
    agent: "CLI Tool",
    action: "MANUAL_ESCALATION_TRIGGER",
    status: "success",
    details: `Manual escalation triggered (${riskLevel.toUpperCase()}) via CLI. Reason: "${reason}". Evaluated routing contacts.`,
    escalationTriggered: escalationResult.escalationTriggered
  });

  console.log(`\n\x1b[32m✔ Escalation Force Evaluation Completed\x1b[0m`);
  console.log(`Resident: ${user.name}`);
  console.log(`Risk status set to: ${riskLevel.toUpperCase()}`);
  console.log(`Notifications triggered: ${escalationResult.notifications.length}`);
  escalationResult.notifications.forEach(n => {
    console.log(`  - Sent ${n.channel.toUpperCase()} to ${n.contactName} (${n.destination})`);
  });
}

function handleLogs() {
  const countStr = args[1] || '10';
  const count = parseInt(countStr);
  const logs = db.getLogs().slice(0, count);

  console.log(`\n\x1b[1mLatest ${logs.length} Agent Decision Logs:\x1b[0m`);
  console.log('----------------------------------------------------');
  logs.forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const alertTag = log.escalationTriggered ? ' \x1b[41m\x1b[37m ALERT \x1b[0m' : '';
    console.log(`[${time}] \x1b[33m${log.agent}\x1b[0m -> \x1b[1m${log.action}\x1b[0m${alertTag}`);
    console.log(`  Resident: ${log.userName} | Status: ${log.status.toUpperCase()}`);
    console.log(`  Details:  ${log.details}`);
    console.log('----------------------------------------------------');
  });
}
