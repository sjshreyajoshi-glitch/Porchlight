const db = require('../data-store');
const security = require('../security');

/**
 * Escalation Agent
 */
class EscalationAgent {
  constructor() {
    this.name = "Escalation Agent";
  }

  /**
   * Evaluates if a user's status requires escalation.
   * Reads user's custom escalation policy.
   * Triggers notifications to contacts depending on thresholds and routing keys.
   */
  evaluateEscalation(userId, sentimentScore, missedCheckins) {
    const policies = db.getPolicies();
    const policy = policies[userId];

    if (!policy) {
      db.addLog({
        userId,
        userName: "Unknown",
        agent: this.name,
        action: "ESCALATION_CHECK",
        status: "error",
        details: `Failed to evaluate escalation. Escalation policy not found for userId: ${userId}`,
        escalationTriggered: false
      });
      return { status: "green", notifications: [], error: "Policy not found" };
    }

    const userName = policy.userName || "Unknown User";

    // Calculate quantitative Distress level (0.0 to 1.0)
    // distress = (1.0 - sentimentScore) + (missedCheckins * 0.35)
    let sentimentDistress = 1.0 - sentimentScore;
    let missedPenalty = missedCheckins * 0.35;
    let totalDistress = Math.min(1.0, sentimentDistress + missedPenalty);

    const thresholds = policy.riskThresholds || { yellow: 0.40, red: 0.70 };
    let status = "green";

    if (totalDistress >= thresholds.red) {
      status = "red";
    } else if (totalDistress >= thresholds.yellow) {
      status = "yellow";
    }

    const notifications = [];
    let escalationTriggered = false;

    if (status !== "green") {
      const routingKeys = policy.routing[status] || [];
      
      if (routingKeys.length === 0) {
        db.addLog({
          userId,
          userName,
          agent: this.name,
          action: "ESCALATION_ROUTING",
          status: "warning",
          details: `User reached ${status.toUpperCase()} risk (distress: ${totalDistress.toFixed(2)}), but no contact routing is configured in policy.`,
          escalationTriggered: false
        });
      } else {
        escalationTriggered = true;
        
        routingKeys.forEach(contactKey => {
          const contact = policy.contacts[contactKey];
          if (!contact) {
            // Handled missing/misconfigured contacts gracefully
            db.addLog({
              userId,
              userName,
              agent: this.name,
              action: "NOTIFICATION_FAILED",
              status: "error",
              details: `Misconfigured policy: Contact tier '${contactKey}' is selected in routing but contains no details.`,
              escalationTriggered: true
            });
            return;
          }

          // Simulate notification delivery
          const message = `[PORCHLIGHT ALERT] Alert level: ${status.toUpperCase()}. Evelyn/Arthur/Beatrice is flagged with high distress. Latest sentiment: ${sentimentScore.toFixed(2)}, Missed check-ins: ${missedCheckins}. Please follow up immediately.`;
          const sanitizedMessage = security.sanitizeMessage(message);
          
          let deliverySuccess = true;
          // Demonstrate error handling: e.g., if phone is 911 or missing required fields for the channel
          if (contact.channel === 'sms' && (!contact.phone || contact.phone.trim().length < 5)) {
            deliverySuccess = false;
          } else if (contact.channel === 'email' && (!contact.email || !contact.email.includes('@'))) {
            deliverySuccess = false;
          }

          if (deliverySuccess) {
            const notifLog = {
              contactName: contact.name,
              channel: contact.channel,
              destination: contact.channel === 'email' ? contact.email : contact.phone,
              message: sanitizedMessage,
              timestamp: new Date().toISOString(),
              status: "delivered"
            };
            notifications.push(notifLog);

            // Log details of safe execution
            db.addLog({
              userId,
              userName,
              agent: this.name,
              action: `SEND_${contact.channel.toUpperCase()}`,
              status: "success",
              details: `Sent ${contact.channel.toUpperCase()} notification to ${contact.name} (${notifLog.destination}). Msg: "${sanitizedMessage.substring(0, 60)}..."`,
              escalationTriggered: true
            });
          } else {
            db.addLog({
              userId,
              userName,
              agent: this.name,
              action: `SEND_${contact.channel.toUpperCase()}`,
              status: "failed",
              details: `Delivery failure. Invalid destination details for contact: ${contact.name} (${contact.channel === 'email' ? contact.email : contact.phone})`,
              escalationTriggered: true
            });
          }
        });
      }
    }

    db.addLog({
      userId,
      userName,
      agent: this.name,
      action: "STATUS_EVALUATION",
      status: "success",
      details: `Evaluated User. Sentiment Score: ${sentimentScore.toFixed(2)}, Missed Check-ins: ${missedCheckins}. Calculated Distress: ${totalDistress.toFixed(2)}. Resulting Status: ${status.toUpperCase()}.`,
      escalationTriggered
    });

    return {
      status,
      totalDistress,
      notifications,
      escalationTriggered
    };
  }
}

module.exports = new EscalationAgent();
