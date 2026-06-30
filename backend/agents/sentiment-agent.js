const db = require('../data-store');

// Rule-based keyword weights for distress/sentiment scoring
const DISTRESS_KEYWORDS = {
  'hurt': 0.25,
  'fell': 0.30,
  'fall': 0.25,
  'pain': 0.20,
  'scared': 0.20,
  'lonely': 0.15,
  'sad': 0.15,
  'sick': 0.20,
  'bleeding': 0.35,
  'hospital': 0.30,
  'doctor': 0.15,
  'dizzy': 0.20,
  'bad': 0.15,
  'emergency': 0.35,
  'help': 0.25,
  'cannot': 0.10,
  'cant': 0.10,
  'terrible': 0.25,
  'missed': 0.15,
  'alone': 0.10
};

const POSITIVE_KEYWORDS = {
  'good': 0.08,
  'well': 0.08,
  'great': 0.10,
  'fine': 0.05,
  'splendid': 0.12,
  'wonderful': 0.12,
  'nice': 0.06,
  'happy': 0.08,
  'lovely': 0.08,
  'pleasant': 0.08
};

/**
 * Sentiment & Distress Detection Agent
 */
class SentimentAgent {
  constructor() {
    this.name = "Sentiment & Distress Agent";
  }

  /**
   * Analyze check-in text.
   * If mockScore is provided, bypass NLP rules and return it directly.
   */
  analyzeSentiment(text, mockScore = null) {
    // If mockScore is manually injected (for demo purposes)
    if (mockScore !== null && mockScore !== undefined && !isNaN(parseFloat(mockScore))) {
      const parsed = parseFloat(mockScore);
      db.addLog({
        userId: "system",
        userName: "MOCK_MODE",
        agent: this.name,
        action: "SENTIMENT_ANALYSIS",
        status: "success",
        details: `Sentiment Agent running in Mock Mode. Bypassed NLP. Injected score: ${parsed.toFixed(2)}.`,
        escalationTriggered: false
      });
      return parsed;
    }

    if (!text || typeof text !== 'string') {
      return 0.5; // neutral
    }

    const cleanText = text.toLowerCase().replace(/[^a-z\s]/g, '');
    const tokens = cleanText.split(/\s+/);
    
    let score = 0.80; // Default positive-leaning baseline
    let distressMatches = [];
    let positiveMatches = [];

    tokens.forEach(token => {
      if (DISTRESS_KEYWORDS[token] !== undefined) {
        score -= DISTRESS_KEYWORDS[token];
        distressMatches.push(token);
      } else if (POSITIVE_KEYWORDS[token] !== undefined) {
        score += POSITIVE_KEYWORDS[token];
        positiveMatches.push(token);
      }
    });

    // Ensure score is bound between 0.0 and 1.0
    score = Math.max(0.0, Math.min(1.0, score));

    db.addLog({
      userId: "system",
      userName: "NLP_ENGINE",
      agent: this.name,
      action: "SENTIMENT_ANALYSIS",
      status: "success",
      details: `Sentiment Agent analyzed check-in. Score: ${score.toFixed(2)}. Distress matched: [${distressMatches.join(', ')}]. Positive matched: [${positiveMatches.join(', ')}].`,
      escalationTriggered: false
    });

    return score;
  }
}

module.exports = new SentimentAgent();
