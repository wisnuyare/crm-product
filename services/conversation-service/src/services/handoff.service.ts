import { config } from '../config';
import { Message } from '../types';
import { messageService } from './message.service';

export interface HandoffDetectionResult {
  shouldHandoff: boolean;
  trigger: 'keyword' | 'confidence' | 'repetitive' | null;
  reason: string;
}

export class HandoffService {
  private keywords: string[];

  constructor() {
    this.keywords = config.conversation.handoffKeywords;
  }

  /**
   * Detect if handoff should be triggered based on message content and history
   */
  async detectHandoff(
    message: string,
    conversationId: string
  ): Promise<HandoffDetectionResult> {
    // 1. Check for handoff keywords
    const keywordDetection = this.detectKeywords(message);
    if (keywordDetection.shouldHandoff) {
      return keywordDetection;
    }

    // 2. Check for repetitive low-confidence responses
    const recentMessages = await messageService.getRecentMessages(
      conversationId,
      6
    );
    const repetitiveDetection = this.detectRepetitiveFailures(recentMessages);
    if (repetitiveDetection.shouldHandoff) {
      return repetitiveDetection;
    }

    // 3. Future: Sentiment analysis
    // const sentimentDetection = await this.detectNegativeSentiment(message);
    // if (sentimentDetection.shouldHandoff) return sentimentDetection;

    return {
      shouldHandoff: false,
      trigger: null,
      reason: '',
    };
  }

  /**
   * Detect handoff keywords in message
   */
  private detectKeywords(message: string): HandoffDetectionResult {
    const lowerMessage = message.toLowerCase();

    for (const keyword of this.keywords) {
      if (lowerMessage.includes(keyword)) {
        return {
          shouldHandoff: true,
          trigger: 'keyword',
          reason: `Customer requested human agent (keyword: "${keyword}")`,
        };
      }
    }

    return { shouldHandoff: false, trigger: null, reason: '' };
  }

  /**
   * Detect repetitive low-confidence responses from LLM
   */
  private detectRepetitiveFailures(messages: Message[]): HandoffDetectionResult {
    // Count LLM messages with low confidence in recent history
    const llmMessages = messages.filter((m) => m.sender_type === 'llm');

    if (llmMessages.length < 3) {
      return { shouldHandoff: false, trigger: null, reason: '' };
    }

    const lowConfidenceCount = llmMessages.filter((m) => {
      return m.metadata && m.metadata.low_confidence === true;
    }).length;

    if (lowConfidenceCount >= 3) {
      return {
        shouldHandoff: true,
        trigger: 'confidence',
        reason: 'Multiple low-confidence responses detected',
      };
    }

    return { shouldHandoff: false, trigger: null, reason: '' };
  }

  /**
   * Future: Detect negative sentiment
   * This would integrate with a sentiment analysis API or model
   */
  private async detectNegativeSentiment(
    message: string
  ): Promise<HandoffDetectionResult> {
    // TODO: Implement sentiment analysis
    // Example: Call Azure Text Analytics or HuggingFace API
    // const sentiment = await sentimentAPI.analyze(message);
    // if (sentiment.score < -0.5) {
    //   return {
    //     shouldHandoff: true,
    //     trigger: 'sentiment',
    //     reason: 'Negative sentiment detected'
    //   };
    // }

    return { shouldHandoff: false, trigger: null, reason: '' };
  }

  /**
   * Check if message contains frustration indicators
   */
  hasFrustrationIndicators(message: string): boolean {
    const frustrationPhrases = [
      'not working',
      'still broken',
      'doesn\'t help',
      'waste of time',
      'useless',
      'terrible',
      'awful',
      'worst',
    ];

    const lowerMessage = message.toLowerCase();
    return frustrationPhrases.some((phrase) =>
      lowerMessage.includes(phrase)
    );
  }
}

export const handoffService = new HandoffService();
