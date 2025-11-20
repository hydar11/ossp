import { CollectionFloors, FloorData, ListingEvent } from './types';

export class FloorTracker {
  private floors: CollectionFloors = {};

  updateFloor(collectionSlug: string, event: ListingEvent): boolean {
    const { base_price, payment_token } = event.payload;
    const priceInEth = parseFloat(base_price) / Math.pow(10, payment_token.decimals);
    const priceUSD = priceInEth * parseFloat(payment_token.usd_price || '0');

    const currentFloor = this.floors[collectionSlug];

    // If no floor exists or new listing is lower, update it
    if (!currentFloor || priceInEth < currentFloor.price) {
      this.floors[collectionSlug] = {
        price: priceInEth,
        priceUSD,
        timestamp: parseInt(event.payload.event_timestamp, 10),
        tokenSymbol: payment_token.symbol
      };
      return true; // Floor was updated
    }

    return false; // Floor was not updated
  }

  getFloor(collectionSlug: string): FloorData | null {
    return this.floors[collectionSlug] || null;
  }

  isUndercut(collectionSlug: string, event: ListingEvent, thresholdPercent: number = 0): {
    isUndercut: boolean;
    listingPrice: number;
    floorPrice: number;
    percentBelow: number;
  } {
    const currentFloor = this.getFloor(collectionSlug);
    const { base_price, payment_token } = event.payload;
    const listingPrice = parseFloat(base_price) / Math.pow(10, payment_token.decimals);

    if (!currentFloor) {
      return {
        isUndercut: false,
        listingPrice,
        floorPrice: 0,
        percentBelow: 0
      };
    }

    const percentBelow = ((currentFloor.price - listingPrice) / currentFloor.price) * 100;
    const isUndercut = percentBelow >= thresholdPercent;

    return {
      isUndercut,
      listingPrice,
      floorPrice: currentFloor.price,
      percentBelow
    };
  }

  getAllFloors(): CollectionFloors {
    return { ...this.floors };
  }

  clearFloor(collectionSlug: string): void {
    delete this.floors[collectionSlug];
  }
}
