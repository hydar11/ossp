import { ListingEvent, NotificationConfig } from './types';
import https from 'https';

export class Notifier {
  constructor(private config: NotificationConfig) {}

  async sendUndercutAlert(
    event: ListingEvent,
    listingPrice: number,
    floorPrice: number,
    percentBelow: number
  ): Promise<void> {
    const { payload } = event;
    const { collection, item, payment_token } = payload;

    const message = this.formatMessage(
      collection.name,
      item.metadata.name,
      listingPrice,
      floorPrice,
      percentBelow,
      payment_token.symbol,
      item.permalink
    );

    // Console output (always enabled)
    this.sendConsoleNotification(message);

    // Discord webhook
    if (this.config.discordWebhook) {
      await this.sendDiscordNotification(message, event);
    }

    // Telegram
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      await this.sendTelegramNotification(message);
    }
  }

  async sendPriceTriggerAlert(
    event: ListingEvent,
    listingPrice: number,
    tokenSymbol: string,
    reason: string
  ): Promise<void> {
    const { payload } = event;
    const { collection, item } = payload;

    const message = `
🎯 PRICE ALERT! 🎯

Collection: ${collection.name || collection.slug}
Item: ${item.metadata.name}
Price: ${listingPrice.toFixed(4)} ${tokenSymbol}
Reason: ${reason}

Link: ${item.permalink}
    `.trim();

    // Console output
    this.sendConsoleNotification(message);

    // Discord webhook
    if (this.config.discordWebhook) {
      await this.sendDiscordNotification(message, event);
    }

    // Telegram
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      await this.sendTelegramNotification(message);
    }
  }

  async sendFloorUpdateAlert(
    collectionSlug: string,
    collectionName: string | undefined,
    newFloor: number,
    tokenSymbol: string
  ): Promise<void> {
    const displayName = collectionName || collectionSlug;
    const message = `🔔 Floor Updated: ${displayName}\nNew Floor: ${newFloor.toFixed(4)} ${tokenSymbol}`;
    this.sendConsoleNotification(message);
  }

  private formatMessage(
    collectionName: string | undefined,
    itemName: string,
    listingPrice: number,
    floorPrice: number,
    percentBelow: number,
    tokenSymbol: string,
    permalink: string
  ): string {
    return `
🚨 UNDERCUT DETECTED! 🚨

Collection: ${collectionName || 'Unknown'}
Item: ${itemName}
Listing Price: ${listingPrice.toFixed(4)} ${tokenSymbol}
Current Floor: ${floorPrice.toFixed(4)} ${tokenSymbol}
Below Floor: ${percentBelow.toFixed(2)}%

Link: ${permalink}
    `.trim();
  }

  private sendConsoleNotification(message: string): void {
    console.log('\n' + '='.repeat(60));
    console.log(message);
    console.log('='.repeat(60) + '\n');
  }

  private async sendDiscordNotification(message: string, event: ListingEvent): Promise<void> {
    if (!this.config.discordWebhook) return;

    const { payload } = event;
    const embed = {
      title: '🚨 Undercut Detected!',
      description: message,
      color: 0xff0000, // Red
      thumbnail: {
        url: payload.item.metadata.image_url
      },
      timestamp: new Date(parseInt(payload.event_timestamp, 10) * 1000).toISOString(),
      footer: {
        text: 'OpenSea Floor Monitor'
      }
    };

    const data = JSON.stringify({
      embeds: [embed]
    });

    return this.makeHttpsRequest(this.config.discordWebhook, data);
  }

  private async sendTelegramNotification(message: string): Promise<void> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) return;

    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    const data = JSON.stringify({
      chat_id: this.config.telegramChatId,
      text: message,
      parse_mode: 'HTML'
    });

    return this.makeHttpsRequest(url, data, {
      'Content-Type': 'application/json'
    });
  }

  private makeHttpsRequest(
    url: string,
    data: string,
    headers: Record<string, string> = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            console.error(`Notification failed: ${res.statusCode} - ${responseData}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('Notification error:', error);
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }
}
