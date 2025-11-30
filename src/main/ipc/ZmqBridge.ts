import * as zmq from 'zeromq';
import * as msgpack from 'msgpack-lite';
import { v4 as uuidv4 } from 'uuid';
import type { XPRequest, XPResponse, XPEvent } from '@shared/types';

const ZMQ_ENDPOINT = 'tcp://127.0.0.1:5555';
const ZMQ_SUB_ENDPOINT = 'tcp://127.0.0.1:5556';
const REQUEST_TIMEOUT = 30000; // 30 seconds

type EventCallback = (event: XPEvent) => void;

export class ZmqBridge {
  private dealer: zmq.Dealer | null = null;
  private subscriber: zmq.Subscriber | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: XPResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private eventCallbacks: EventCallback[] = [];
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Create DEALER socket for request/response
      this.dealer = new zmq.Dealer();
      this.dealer.connect(ZMQ_ENDPOINT);

      // Create SUBSCRIBER socket for events
      this.subscriber = new zmq.Subscriber();
      this.subscriber.connect(ZMQ_SUB_ENDPOINT);

      // Start receiving messages
      this.startReceiving();
      this.startSubscriberReceiving();

      this.connected = true;
      console.log('ZeroMQ bridge connected');
    } catch (error) {
      console.error('Failed to connect ZeroMQ bridge:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.dealer) {
      this.dealer.close();
      this.dealer = null;
    }
    if (this.subscriber) {
      this.subscriber.close();
      this.subscriber = null;
    }
    this.connected = false;

    // Reject all pending requests
    for (const [id, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
      reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  async sendRequest(request: Omit<XPRequest, 'id'>): Promise<XPResponse> {
    if (!this.dealer || !this.connected) {
      throw new Error('Not connected to backend');
    }

    const id = uuidv4();
    const fullRequest: XPRequest = { ...request, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${request.action}`));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request as msgpack
      const encoded = msgpack.encode(fullRequest);
      this.dealer!.send(Buffer.from(encoded));
    });
  }

  subscribe(path: string): void {
    if (this.subscriber) {
      this.subscriber.subscribe(path);
    }
  }

  unsubscribe(path: string): void {
    if (this.subscriber) {
      this.subscriber.unsubscribe(path);
    }
  }

  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  offEvent(callback: EventCallback): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  private async startReceiving(): Promise<void> {
    if (!this.dealer) return;

    try {
      for await (const [msg] of this.dealer) {
        try {
          const response = msgpack.decode(msg) as XPResponse;
          const pending = this.pendingRequests.get(response.id);

          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        } catch (error) {
          console.error('Failed to decode response:', error);
        }
      }
    } catch (error) {
      if (this.connected) {
        console.error('Dealer receive error:', error);
      }
    }
  }

  private async startSubscriberReceiving(): Promise<void> {
    if (!this.subscriber) return;

    try {
      for await (const [topic, msg] of this.subscriber) {
        try {
          const event = msgpack.decode(msg) as XPEvent;
          for (const callback of this.eventCallbacks) {
            callback(event);
          }
        } catch (error) {
          console.error('Failed to decode event:', error);
        }
      }
    } catch (error) {
      if (this.connected) {
        console.error('Subscriber receive error:', error);
      }
    }
  }
}
