import { BotConfig } from './types';
import * as dotenv from 'dotenv';

dotenv.config();

export function loadConfig(): BotConfig {
  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    throw new Error('OPENSEA_API_KEY is required in .env file');
  }

  const collectionsStr = process.env.COLLECTIONS;
  if (!collectionsStr) {
    throw new Error('COLLECTIONS is required in .env file (comma-separated collection slugs)');
  }

  const collections = collectionsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
  if (collections.length === 0) {
    throw new Error('At least one collection slug is required');
  }

  const undercutThresholdPercent = parseFloat(process.env.UNDERCUT_THRESHOLD_PERCENT || '0');

  return {
    apiKey,
    collections,
    undercutThresholdPercent,
    notifications: {
      discordWebhook: process.env.DISCORD_WEBHOOK_URL,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID
    }
  };
}
