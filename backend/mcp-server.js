const readline = require('readline');
const db = require('./data-store');
const coordinator = require('./agents/coordinator-agent');
const escalationAgent = require('./agents/escalation-agent');
const security = require('./security');

// Set up standard input interface for JSON-RPC communications
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Tools definition according to Model Context Protocol (MCP) spec
const TOOLS = [
  {
    name: "get_user_history",
    description: "Retrieve a monitored user's history, including logs of checks-ins, sentiment scores, and triggered escalations.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The ID of the user (e.g. u1, u2, u3)" }
      },
      required: ["userId"]
    }
  },
  {
    name: "log_checkin",
    description: "Logs a daily check-in text, runs sentiment analysis, updates the streak, and checks for escalations.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The ID of the user" },
        text: { type: "string", description: "The content of the check-in text" },
        source: { type: "string", enum: ["sms", "voice", "app"], description: "The check-in channel" },
        mockScore: { type: "number", description: "Optional simulated score between 0.0 and 1.0 (Mock Mode)" }
      },
      required: ["userId", "text"]
    }
  },
  {
    name: "get_escalation_policy",
    description: "Retrieves the personalized risk thresholds, contact lists, and routing rules for a user.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID" }
      },
      required: ["userId"]
    }
  },
  {
    name: "update_escalation_policy",
    description: "Modifies and saves a user's escalation policy after performing security validation.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID" },
        policy: { 
          type: "object",
          description: "Complete policy object with riskThresholds, contacts, and routing." 
        }
      },
      required: ["userId", "policy"]
    }
  },
  {
    name: "trigger_escalation",
    description: "Forces a manual escalation check or manual risk override for a specific user.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID" },
        riskLevel: { type: "string", enum: ["yellow", "red"], description: "Force trigger level" },
        reason: { type: "string", description: "Description for audit log trigger" }
      },
      required: ["userId", "riskLevel", "reason"]
    }
  },
  {
    name: "notify_contact",
    description: "Simulates direct contact notification for a volunteer, family member or emergency service.",
    inputSchema: {
      type: "object",
      properties: {
        contactName: { type: "string", description: "Full name of the contact" },
        channel: { type: "string", enum: ["sms", "email", "call"], description: "Delivery channel" },
        destination: { type: "string", description: "Email address or phone number" },
        message: { type: "string", description: "Notification body" }
      },
      required: ["contactName", "channel", "destination", "message"]
    }
  }
];

// Handle incoming JSON-RPC calls
rl.on('line', (line) => {
  if (!line.trim()) return;
  
  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    sendError(null, -32700, "Parse error: Invalid JSON");
    return;
  }

  const { jsonrpc, method, params, id } = request;

  if (jsonrpc !== "2.0") {
    sendError(id, -32600, "Invalid Request: Must specify jsonrpc: 2.0");
    return;
  }

  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "porchlight-mcp-server",
          version: "1.0.0"
        }
      });
      break;

    case "tools/list":
      sendResponse(id, { tools: TOOLS });
      break;

    case "tools/call":
      handleToolCall(id, params);
      break;

    default:
      sendError(id, -32601, `Method not found: ${method}`);
  }
});

function handleToolCall(id, params) {
  if (!params || !params.name) {
    sendError(id, -32602, "Invalid params: name is required");
    return;
  }

  const toolName = params.name;
  const args = params.arguments || {};

  try {
    switch (toolName) {
      case "get_user_history": {
        const { userId } = args;
        if (!userId) return sendError(id, -32602, "userId argument is required");
        
        const logs = db.getLogs().filter(log => log.userId === userId);
        const users = db.getUsers();
        const user = users.find(u => u.id === userId);

        if (!user) {
          return sendToolResult(id, `User not found: ${userId}`, true);
        }

        return sendToolResult(id, {
          user,
          historyCount: logs.length,
          logs: logs.slice(0, 10) // return last 10 log items
        });
      }

      case "log_checkin": {
        const { userId, text, source, mockScore } = args;
        
        // Input validation (Security constraint)
        const checkValidation = security.validateCheckin(userId, text, source);
        if (!checkValidation.valid) {
          return sendToolResult(id, `Validation failed: ${checkValidation.errors.join("; ")}`, true);
        }

        const result = coordinator.processCheckin(userId, text, mockScore);
        if (!result.success) {
          return sendToolResult(id, `Log check-in failed: ${result.error}`, true);
        }

        return sendToolResult(id, {
          message: "Check-in logged successfully",
          user: result.user,
          escalation: result.escalation
        });
      }

      case "get_escalation_policy": {
        const { userId } = args;
        if (!userId) return sendError(id, -32602, "userId argument is required");

        const policies = db.getPolicies();
        const policy = policies[userId];

        if (!policy) {
          return sendToolResult(id, `Policy not found for user ID: ${userId}`, true);
        }

        return sendToolResult(id, policy);
      }

      case "update_escalation_policy": {
        const { userId, policy } = args;
        if (!userId || !policy) {
          return sendError(id, -32602, "userId and policy are required");
        }

        // Input validation (Security constraint)
        const valResult = security.validateEscalationPolicy(policy);
        if (!valResult.valid) {
          return sendToolResult(id, `Validation failed: ${valResult.errors.join("; ")}`, true);
        }

        const policies = db.getPolicies();
        policies[userId] = { ...policy, userId }; // lock userId
        db.savePolicies(policies);

        db.addLog({
          userId,
          userName: policy.userName || "System",
          agent: "MCP Server Tool",
          action: "UPDATE_POLICY",
          status: "success",
          details: `Escalation policy updated via MCP tool. Thresholds updated (yellow: ${policy.riskThresholds.yellow}, red: ${policy.riskThresholds.red}).`,
          escalationTriggered: false
        });

        return sendToolResult(id, {
          message: "Escalation policy updated successfully.",
          policy: policies[userId]
        });
      }

      case "trigger_escalation": {
        const { userId, riskLevel, reason } = args;
        if (!userId || !riskLevel || !reason) {
          return sendError(id, -32602, "userId, riskLevel and reason are required");
        }

        const policies = db.getPolicies();
        const policy = policies[userId];
        if (!policy) {
          return sendToolResult(id, `User policy not found for ID: ${userId}`, true);
        }

        // Simulating manual trigger from the coordinator
        const users = db.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return sendToolResult(id, `User not found`, true);

        // Adjust risk status manually
        user.riskStatus = riskLevel;
        db.saveUsers(users);

        // Force Escalation Agent execution
        const score = riskLevel === 'red' ? 0.10 : 0.45; // force scores to match thresholds
        const escalationResult = escalationAgent.evaluateEscalation(userId, score, user.missedCheckins);

        db.addLog({
          userId,
          userName: user.name,
          agent: "MCP Server Tool",
          action: "MANUAL_ESCALATION_TRIGGER",
          status: "success",
          details: `Manual escalation triggered (${riskLevel.toUpperCase()}). Reason: "${reason}". Evaluated routing contacts.`,
          escalationTriggered: escalationResult.escalationTriggered
        });

        return sendToolResult(id, {
          message: `Manual escalation for ${user.name} processed.`,
          status: riskLevel,
          escalation: escalationResult
        });
      }

      case "notify_contact": {
        const { contactName, channel, destination, message } = args;
        
        // Validation check
        if (!contactName || !channel || !destination || !message) {
          return sendToolResult(id, "Missing required notify arguments.", true);
        }

        const sanitizedMsg = security.sanitizeMessage(message);

        db.addLog({
          userId: "system",
          userName: "Direct Contact Notify",
          agent: "MCP Server Tool",
          action: `NOTIFY_${channel.toUpperCase()}`,
          status: "success",
          details: `Direct notification processed. Recipient: ${contactName} via ${channel} (${destination}). Message: "${sanitizedMsg.substring(0, 45)}..."`,
          escalationTriggered: true
        });

        return sendToolResult(id, {
          message: `Direct mock notification successfully dispatched.`,
          recipient: contactName,
          channel,
          destination,
          body: sanitizedMsg
        });
      }

      default:
        sendError(id, -32601, `Tool not found: ${toolName}`);
    }
  } catch (err) {
    sendError(id, -32603, `Internal tool execution error: ${err.message}`);
  }
}

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id,
    result
  }) + "\n");
}

function sendToolResult(id, textOrJson, isError = false) {
  const content = [];
  if (typeof textOrJson === 'string') {
    content.push({ type: "text", text: textOrJson });
  } else {
    content.push({ type: "text", text: JSON.stringify(textOrJson, null, 2) });
  }

  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: {
      content,
      isError
    }
  }) + "\n");
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  }) + "\n");
}
