import type { ChannelConfig, Message, MessageHandler } from '../core/types';

/**
 * MessageBroker — Inter-agent communication system.
 *
 * Supports pub/sub channels, direct messaging, and message history.
 */
export class MessageBroker {
  private _channels: Map<string, Channel>;
  private _messageCounter: number;

  constructor() {
    this._channels = new Map();
    this._messageCounter = 0;
  }

  /**
   * Create a new channel.
   */
  createChannel(config: ChannelConfig): Channel {
    if (this._channels.has(config.name)) {
      throw new Error(`Channel "${config.name}" already exists`);
    }
    const channel = new Channel(config);
    this._channels.set(config.name, channel);
    return channel;
  }

  /**
   * Get an existing channel.
   */
  getChannel(name: string): Channel | undefined {
    return this._channels.get(name);
  }

  /**
   * Delete a channel.
   */
  deleteChannel(name: string): void {
    this._channels.delete(name);
  }

  /**
   * Publish a message to a channel.
   */
  publish<T = unknown>(channelName: string, from: string, data: T): Message<T> {
    const channel = this._channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel "${channelName}" does not exist`);
    }

    this._messageCounter++;
    const message: Message<T> = {
      id: `msg-${this._messageCounter}-${Date.now().toString(36)}`,
      channel: channelName,
      from,
      data,
      timestamp: new Date(),
    };

    channel._deliver(message);
    return message;
  }

  /**
   * Subscribe to a channel.
   */
  subscribe<T = unknown>(
    channelName: string,
    subscriberId: string,
    handler: MessageHandler<T>
  ): () => void {
    const channel = this._channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel "${channelName}" does not exist`);
    }

    return channel._subscribe(subscriberId, handler as MessageHandler);
  }

  /**
   * Send a direct message to a specific subscriber.
   */
  sendDirect<T = unknown>(from: string, to: string, data: T): Message<T> {
    // Direct messages use an auto-created channel
    const channelName = `__direct__:${[from, to].sort().join(':')}`;

    if (!this._channels.has(channelName)) {
      this.createChannel({
        name: channelName,
        type: 'direct',
        historyLimit: 100,
      });
    }

    return this.publish(channelName, from, data);
  }

  /**
   * List all channels.
   */
  get channels(): ChannelConfig[] {
    return Array.from(this._channels.values()).map((c) => c.config);
  }

  /**
   * Get broker stats.
   */
  get stats(): { channels: number; totalMessages: number } {
    return {
      channels: this._channels.size,
      totalMessages: this._messageCounter,
    };
  }
}

/**
 * Channel — A named communication pipe.
 */
class Channel {
  readonly config: ChannelConfig;
  private _subscribers: Map<string, MessageHandler>;
  private _history: Message[];

  constructor(config: ChannelConfig) {
    this.config = config;
    this._subscribers = new Map();
    this._history = [];
  }

  get subscriberCount(): number {
    return this._subscribers.size;
  }

  get history(): readonly Message[] {
    return this._history;
  }

  /** @internal Called by MessageBroker */
  _subscribe(subscriberId: string, handler: MessageHandler): () => void {
    this._subscribers.set(subscriberId, handler);
    return () => {
      this._subscribers.delete(subscriberId);
    };
  }

  /** @internal Called by MessageBroker */
  _deliver(message: Message): void {
    // Store in history
    this._history.push(message);
    const limit = this.config.historyLimit ?? 1000;
    if (this._history.length > limit) {
      this._history = this._history.slice(-limit);
    }

    // Deliver to subscribers (except sender)
    for (const [subscriberId, handler] of this._subscribers) {
      if (subscriberId !== message.from) {
        try {
          handler(message);
        } catch {
          // Don't let subscriber errors break delivery
        }
      }
    }
  }
}
