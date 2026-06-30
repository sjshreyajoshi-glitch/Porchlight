const db = require('../data-store');

/**
 * Check-In Agent
 */
class CheckInAgent {
  constructor() {
    this.name = "Check-In Agent";
  }

  /**
   * Handles a completed check-in, resetting missed check-in counters and updating streaks.
   */
  processIncomingCheckin(userId, text, sentimentScore) {
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      db.addLog({
        userId,
        userName: "Unknown",
        agent: this.name,
        action: "CHECKIN_RECEIVED",
        status: "error",
        details: `Check-in received for unknown user ID: ${userId}`,
        escalationTriggered: false
      });
      return null;
    }

    const user = users[userIndex];
    user.missedCheckins = 0;
    user.streak += 1;
    user.lastCheckinTime = new Date().toISOString();
    user.lastCheckinText = text;
    user.sentimentScore = sentimentScore;

    db.saveUsers(users);

    db.addLog({
      userId,
      userName: user.name,
      agent: this.name,
      action: "CHECKIN_SUCCESS",
      status: "success",
      details: `Received check-in from ${user.name}: "${text.substring(0, 50)}...". Streak updated to ${user.streak}.`,
      escalationTriggered: false
    });

    return user;
  }

  /**
   * Handles a missed check-in trigger. Breaks the streak and flags the event.
   */
  processMissedCheckin(userId) {
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      db.addLog({
        userId,
        userName: "Unknown",
        agent: this.name,
        action: "MISSED_CHECKIN",
        status: "error",
        details: `Attempted to log missed check-in for unknown user ID: ${userId}`,
        escalationTriggered: false
      });
      return null;
    }

    const user = users[userIndex];
    user.missedCheckins += 1;
    user.streak = 0; // Streak resets on missed check-in

    db.saveUsers(users);

    db.addLog({
      userId,
      userName: user.name,
      agent: this.name,
      action: "MISSED_CHECKIN_LOGGED",
      status: "warning",
      details: `Missed check-in registered for ${user.name}. Consecutive missed: ${user.missedCheckins}. Streak reset to 0.`,
      escalationTriggered: false
    });

    return user;
  }
}

module.exports = new CheckInAgent();
