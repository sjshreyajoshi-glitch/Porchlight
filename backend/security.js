const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/; // E.164 phone validation

// Authenticated roles for modifying policies or retrieving agent logs
const ADMIN_API_KEY = "Coordinator-Admin-Key";

/**
 * Express middleware to enforce authorization for policy edits or admin actions.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['x-porchlight-auth'];
  if (!authHeader || authHeader !== ADMIN_API_KEY) {
    return res.status(403).json({
      error: "Access Denied",
      message: "You are not authorized to perform this operation. Missing or invalid X-Porchlight-Auth header."
    });
  }
  next();
}

/**
 * Validate Check-in inputs (text content and format).
 */
function validateCheckin(userId, text, source) {
  const errors = [];
  
  if (!userId || typeof userId !== 'string') {
    errors.push("Invalid or missing userId.");
  }
  
  if (!text || typeof text !== 'string') {
    errors.push("Check-in text must be a valid string.");
  } else if (text.trim().length === 0) {
    errors.push("Check-in text cannot be empty.");
  } else if (text.length > 500) {
    errors.push("Check-in text exceeds safety limit of 500 characters.");
  }

  if (source && !['sms', 'voice', 'app', 'system'].includes(source)) {
    errors.push("Check-in source must be one of: sms, voice, app, system.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate Escalation Policy inputs.
 */
function validateEscalationPolicy(policy) {
  const errors = [];

  if (!policy) {
    errors.push("Policy body is empty.");
    return { valid: false, errors };
  }

  // Validate risk thresholds
  const th = policy.riskThresholds;
  if (!th) {
    errors.push("Missing risk thresholds (yellow and red).");
  } else {
    if (typeof th.yellow !== 'number' || th.yellow < 0 || th.yellow > 1) {
      errors.push("Yellow risk threshold must be a number between 0.0 and 1.0.");
    }
    if (typeof th.red !== 'number' || th.red < 0 || th.red > 1) {
      errors.push("Red risk threshold must be a number between 0.0 and 1.0.");
    }
    if (th.yellow >= th.red) {
      errors.push("Yellow threshold must be strictly lower than the red threshold.");
    }
  }

  // Validate contacts
  const contacts = policy.contacts;
  if (!contacts) {
    errors.push("Missing contacts profile object.");
  } else {
    for (const key of ['volunteer', 'family1', 'family2', 'emergency']) {
      const contact = contacts[key];
      if (contact) {
        if (!contact.name || typeof contact.name !== 'string' || contact.name.trim().length === 0) {
          errors.push(`Contact name for '${key}' is required.`);
        }
        if (!contact.channel || !['sms', 'email', 'call'].includes(contact.channel)) {
          errors.push(`Contact '${key}' must have a notification channel (sms, email, call).`);
        }
        if (contact.email && !EMAIL_REGEX.test(contact.email)) {
          errors.push(`Contact '${key}' has an invalid email format.`);
        }
        if (contact.phone) {
          // Remove spaces/dashes for standard E.164 verification
          const sanitizedPhone = contact.phone.replace(/[\s-()]/g, '');
          if (!PHONE_REGEX.test(sanitizedPhone) && sanitizedPhone !== '911') {
            errors.push(`Contact '${key}' has an invalid phone number format.`);
          }
        }
      }
    }
  }

  // Validate routing links
  const routing = policy.routing;
  if (!routing) {
    errors.push("Missing escalation routing config.");
  } else {
    for (const alertLevel of ['yellow', 'red']) {
      const targets = routing[alertLevel];
      if (!Array.isArray(targets)) {
        errors.push(`Routing for '${alertLevel}' must be an array of contact keys.`);
      } else {
        targets.forEach(target => {
          if (!['volunteer', 'family1', 'family2', 'emergency'].includes(target)) {
            errors.push(`Routing target '${target}' is not a valid contact tier.`);
          } else if (!contacts[target]) {
            errors.push(`Routing target '${target}' is selected but no contact info is defined.`);
          }
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes check-in text or message payloads to prevent command injections or malicious HTML/script injections.
 */
function sanitizeMessage(text) {
  if (typeof text !== 'string') return '';
  // Strip out HTML tag patterns, shell meta-characters, and control symbols
  return text
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/[&`;|$<>]/g, '') // remove shell operators
    .trim();
}

module.exports = {
  authMiddleware,
  validateCheckin,
  validateEscalationPolicy,
  sanitizeMessage,
  ADMIN_API_KEY
};
