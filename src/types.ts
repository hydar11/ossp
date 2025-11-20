export interface ListingEvent {
  event_type: string;
  payload: {
    item: {
      nft_id: string;
      metadata: {
        name: string;
        image_url: string;
      };
      permalink: string;
    };
    base_price: string;
    payment_token: {
      symbol: string;
      decimals: number;
      usd_price: string;
    };
    maker: {
      address: string;
    };
    event_timestamp: string;
    collection: {
      slug: string;
      name?: string;
    };
    protocol_data?: {
      parameters?: {
        offer?: Array<{
          startAmount: string;
          endAmount: string;
        }>;
      };
    };
  };
}

export interface FloorData {
  price: number;
  priceUSD: number;
  timestamp: number;
  tokenSymbol: string;
}

export interface CollectionFloors {
  [collectionSlug: string]: FloorData;
}

export interface NotificationConfig {
  discordWebhook?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export interface BotConfig {
  apiKey: string;
  collections: string[];
  undercutThresholdPercent: number;
  notifications: NotificationConfig;
}
