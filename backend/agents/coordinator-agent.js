const db = require('../data-store');
const checkinAgent = require('./checkin-agent');
const sentimentAgent = require('./sentiment-agent');
const escalationAgent = require('./escalation-agent');
const security = require('../security');

/**
 * Care Coordinator Agent
 * Central dispatcher of the ADK Multi-Agent System
 */
class CoordinatorAgent {
  constructor() {
    this.name = "Care Coordinator Agent";
  }

  /**
   * Orchestrates a successful check-in flow:
   * check-in content -> sentiment analysis -> streak update -> escalation check -> state updates
   */
  processCheckin(userId, text, mockSentimentScore = null) {
    db.addLog({
      userId,
      userName: "System",
      agent: this.name,
      action: "COORDINATION_START",
      status: "success",
      details: `Initiating multi-agent check-in workflow for user: ${userId}. Mock score: ${mockSentimentScore !== null ? mockSentimentScore : 'None'}`,
      escalationTriggered: false
    });

    // 1. Sanitize input text (Security Constraint)
    const sanitizedText = security.sanitizeMessage(text);

    // 2. Sentiment analysis (Sentiment Agent)
    const score = sentimentAgent.analyzeSentiment(sanitizedText, mockSentimentScore);

    // 3. Update check-in record & streaks (Check-In Agent)
    const updatedUser = checkinAgent.processIncomingCheckin(userId, sanitizedText, score);
    if (!updatedUser) {
      return { success: false, error: "User update failed" };
    }

    // 4. Evaluate escalation policy and threshold (Escalation Agent)
    const escalationResult = escalationAgent.evaluateEscalation(userId, score, updatedUser.missedCheckins);

    // 5. Update user risk status in db
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].riskStatus = escalationResult.status;
      db.saveUsers(users);
    }

    db.addLog({
      userId,
      userName: updatedUser.name,
      agent: this.name,
      action: "COORDINATION_COMPLETE",
      status: "success",
      details: `Completed check-in orchestration. User risk level: ${escalationResult.status.toUpperCase()}.`,
      escalationTriggered: escalationResult.escalationTriggered
    });

    return {
      success: true,
      user: { ...updatedUser, riskStatus: escalationResult.status },
      escalation: escalationResult
    };
  }

  /**
   * Orchestrates a missed check-in flow:
   * increment missed check-ins -> break streak -> escalation check -> state updates
   */
  processMissedCheckin(userId) {
    db.addLog({
      userId,
      userName: "System",
      agent: this.name,
      action: "COORDINATION_START",
      status: "success",
      details: `Initiating missed check-in workflow for user: ${userId}`,
      escalationTriggered: false
    });

    // 1. Log missed checkin and reset streak (Check-In Agent)
    const updatedUser = checkinAgent.processMissedCheckin(userId);
    if (!updatedUser) {
      return { success: false, error: "User update failed" };
    }

    // 2. Evaluate escalation policy using updated missedCount and their last sentiment score
    const escalationResult = escalationAgent.evaluateEscalation(
      userId, 
      updatedUser.sentimentScore || 0.70, // use last score or a neutral-default if none
      updatedUser.missedCheckins
    );

    // 3. Update user risk status in db
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex].riskStatus = escalationResult.status;
      db.saveUsers(users);
    }

    db.addLog({
      userId,
      userName: updatedUser.name,
      agent: this.name,
      action: "COORDINATION_COMPLETE",
      status: "success",
      details: `Completed missed check-in orchestration. User consecutive missed: ${updatedUser.missedCheckins}. Status: ${escalationResult.status.toUpperCase()}.`,
      escalationTriggered: escalationResult.escalationTriggered
    });

    return {
      success: true,
      user: { ...updatedUser, riskStatus: escalationResult.status },
      escalation: escalationResult
    };
  }
}

module.exports = new CoordinatorAgent();
