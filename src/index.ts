import { OpenSeaStreamClient, EventType } from '@opensea/stream-js';
import { WebSocket } from 'ws';
import { loadConfig } from './config';
import { FloorTracker } from './floorTracker';
import { Notifier } from './notifier';
import { ListingEvent } from './types';
import { SettingsManager } from './settingsManager';
import { WebServer } from './webServer';

class OpenSeaFloorMonitor {
  private client: OpenSeaStreamClient;
  private floorTracker: FloorTracker;
  private notifier: Notifier;
  private config: ReturnType<typeof loadConfig>;
  private settingsManager: SettingsManager;
  private webServer: WebServer;
  private isListening: boolean = false;

  constructor() {
    this.config = loadConfig();
    this.settingsManager = new SettingsManager();
    this.floorTracker = new FloorTracker();

    // Use settings from settings manager if available
    const settings = this.settingsManager.getSettings();
    if (settings.collections.length > 0) {
      this.config.collections = settings.collections;
    }
    if (settings.undercutThresholdPercent !== undefined) {
      this.config.undercutThresholdPercent = settings.undercutThresholdPercent;
    }
    if (settings.telegramBotToken) {
      this.config.notifications.telegramBotToken = settings.telegramBotToken;
    }
    if (settings.telegramChatId) {
      this.config.notifications.telegramChatId = settings.telegramChatId;
    }
    if (settings.discordWebhook) {
      this.config.notifications.discordWebhook = settings.discordWebhook;
    }

    this.notifier = new Notifier(this.config.notifications);

    // Initialize web server (Render provides PORT automatically)
    const port = parseInt(process.env.PORT || '5437', 10);
    this.webServer = new WebServer(this.settingsManager, port);

    // Initialize OpenSea Stream client
    this.client = new OpenSeaStreamClient({
      token: this.config.apiKey,
      connectOptions: {
        transport: WebSocket
      },
      onError: (error) => {
        console.error('Stream error:', error);
      }
    });

    console.log('🚀 OpenSea Floor Monitor Starting...');
    console.log(`📊 Monitoring ${this.config.collections.length} collection(s):`);
    this.config.collections.forEach(slug => console.log(`   - ${slug}`));
    console.log(`🎯 Undercut threshold: ${this.config.undercutThresholdPercent}%`);
    console.log('');
  }

  start(): void {
    // Start web server first
    this.webServer.start();
    this.webServer.setBotInstance(this);

    // Auto-start listening
    this.startListening();

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down gracefully...');
      this.stopListening();
      process.exit(0);
    });
  }

  startListening(): void {
    if (this.isListening) {
      console.log('⚠️ Already listening...');
      return;
    }

    console.log('▶️ Starting to listen for events...');
    this.config.collections.forEach(collectionSlug => {
      this.subscribeToCollection(collectionSlug);
    });

    this.isListening = true;
    console.log('✅ Bot is now listening for listings...');

    this.webServer.updateBotStatus({
      isRunning: true,
      collections: this.config.collections,
      floors: this.floorTracker.getAllFloors(),
      lastEvents: []
    });
  }

  stopListening(): void {
    if (!this.isListening) {
      console.log('⚠️ Already stopped...');
      return;
    }

    console.log('⏹️ Stopping listener...');
    this.client.disconnect();
    this.isListening = false;
    console.log('✅ Bot stopped listening');

    this.webServer.updateBotStatus({
      isRunning: false,
      collections: this.config.collections,
      floors: this.floorTracker.getAllFloors(),
      lastEvents: []
    });

    // Recreate client for future reconnection
    this.client = new OpenSeaStreamClient({
      token: this.config.apiKey,
      connectOptions: {
        transport: WebSocket
      },
      onError: (error) => {
        console.error('Stream error:', error);
      }
    });
  }

  getListeningStatus(): boolean {
    return this.isListening;
  }

  private subscribeToCollection(collectionSlug: string): void {
    // Subscribe to item listed events
    this.client.onItemListed(collectionSlug, async (event) => {
      await this.handleListingEvent(event as ListingEvent);
    });

    // Subscribe to item sold events (to track floor changes)
    this.client.onItemSold(collectionSlug, (event) => {
      const itemName = event.payload.item?.metadata?.name || 'Unknown';
      console.log(`💰 Sale detected in ${collectionSlug}: ${itemName}`);
    });

    console.log(`✓ Subscribed to ${collectionSlug}`);
  }

  private async handleListingEvent(event: ListingEvent): Promise<void> {
    const { collection, item, base_price, payment_token } = event.payload;
    const collectionSlug = collection.slug;
    const settings = this.settingsManager.getSettings();

    // Calculate listing price
    const listingPrice = parseFloat(base_price) / Math.pow(10, payment_token.decimals);

    console.log(`📝 New listing: ${item.metadata.name} | ${listingPrice.toFixed(4)} ${payment_token.symbol}`);

    // Add event to web UI
    this.webServer.addEvent({
      type: 'listing',
      message: `${item.metadata.name} listed for ${listingPrice.toFixed(4)} ${payment_token.symbol}`,
      collection: collectionSlug
    });

    // Price Trigger Alerts (New System)
    if (settings.enablePriceTriggerAlerts) {
      let shouldAlert = false;
      let alertReason = '';

      // Check if price is below minimum trigger
      if (settings.priceAlertMin !== undefined && listingPrice < settings.priceAlertMin) {
        shouldAlert = true;
        alertReason = `Below ${settings.priceAlertMin} ETH`;
      }

      // Check if price is above maximum trigger
      if (settings.priceAlertMax !== undefined && listingPrice > settings.priceAlertMax) {
        shouldAlert = true;
        alertReason = `Above ${settings.priceAlertMax} ETH`;
      }

      if (shouldAlert) {
        await this.notifier.sendPriceTriggerAlert(
          event,
          listingPrice,
          payment_token.symbol,
          alertReason
        );

        this.webServer.addEvent({
          type: 'price_alert',
          message: `🎯 ${item.metadata.name}: ${listingPrice.toFixed(4)} ${payment_token.symbol} (${alertReason})`,
          collection: collectionSlug
        });
      }
    }

    // Legacy: Check if this is an undercut (only if price triggers disabled)
    if (!settings.enablePriceTriggerAlerts) {
      const undercutResult = this.floorTracker.isUndercut(
        collectionSlug,
        event,
        this.config.undercutThresholdPercent
      );

      if (undercutResult.isUndercut) {
        // Check min/max floor price filters
        if (settings.minFloorPrice && undercutResult.floorPrice < settings.minFloorPrice) {
          return;
        }
        if (settings.maxFloorPrice && undercutResult.floorPrice > settings.maxFloorPrice) {
          return;
        }

        await this.notifier.sendUndercutAlert(
          event,
          undercutResult.listingPrice,
          undercutResult.floorPrice,
          undercutResult.percentBelow
        );

        this.webServer.addEvent({
          type: 'undercut',
          message: `🚨 ${item.metadata.name}: ${listingPrice.toFixed(4)} ${payment_token.symbol} (${undercutResult.percentBelow.toFixed(2)}% below floor)`,
          collection: collectionSlug
        });
      }
    }

    // Update floor price
    const floorUpdated = this.floorTracker.updateFloor(collectionSlug, event);

    if (floorUpdated) {
      const newFloor = this.floorTracker.getFloor(collectionSlug);
      if (newFloor) {
        const displayName = collection.name || collectionSlug;
        console.log(`📉 Floor updated for ${displayName}: ${newFloor.price.toFixed(4)} ${newFloor.tokenSymbol}`);

        if (settings.enableFloorUpdateAlerts !== false) {
          await this.notifier.sendFloorUpdateAlert(
            collectionSlug,
            collection.name,
            newFloor.price,
            newFloor.tokenSymbol
          );
        }

        this.webServer.addEvent({
          type: 'floor_update',
          message: `Floor updated: ${newFloor.price.toFixed(4)} ${newFloor.tokenSymbol}`,
          collection: collectionSlug
        });
      }

      // Update web UI with new floors
      this.webServer.updateBotStatus({
        floors: this.floorTracker.getAllFloors()
      });
    }
  }

  getFloors() {
    return this.floorTracker.getAllFloors();
  }
}

// Start the bot
const bot = new OpenSeaFloorMonitor();
bot.start();

// Export for programmatic use
export default OpenSeaFloorMonitor;
