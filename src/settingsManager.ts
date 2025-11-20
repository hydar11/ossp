import * as fs from 'fs';
import * as path from 'path';

export interface BotSettings {
  collections: string[];
  undercutThresholdPercent: number;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramNickname?: string;
  discordWebhook?: string;
  discordNickname?: string;
  minFloorPrice?: number;
  maxFloorPrice?: number;
  enableNewListingAlerts: boolean;
  enableSaleAlerts: boolean;
  enableFloorUpdateAlerts: boolean;
  // Price trigger alerts
  priceAlertMin?: number;  // Alert when listing is BELOW this price
  priceAlertMax?: number;  // Alert when listing is ABOVE this price
  enablePriceTriggerAlerts: boolean;
}

export class SettingsManager {
  private settingsPath: string;
  private settings: BotSettings;

  constructor() {
    this.settingsPath = path.join(process.cwd(), 'bot-settings.json');
    this.settings = this.loadSettings();
  }

  private loadSettings(): BotSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }

    // Return default settings
    return {
      collections: process.env.COLLECTIONS?.split(',').map(c => c.trim()) || [],
      undercutThresholdPercent: parseFloat(process.env.UNDERCUT_THRESHOLD_PERCENT || '0'),
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      discordWebhook: process.env.DISCORD_WEBHOOK_URL,
      enableNewListingAlerts: true,
      enableSaleAlerts: true,
      enableFloorUpdateAlerts: true,
      priceAlertMin: undefined,
      priceAlertMax: undefined,
      enablePriceTriggerAlerts: false
    };
  }

  saveSettings(settings: Partial<BotSettings>): void {
    this.settings = { ...this.settings, ...settings };
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving settings:', error);
      throw new Error('Failed to save settings');
    }
  }

  getSettings(): BotSettings {
    return { ...this.settings };
  }

  getSetting<K extends keyof BotSettings>(key: K): BotSettings[K] {
    return this.settings[key];
  }
}
