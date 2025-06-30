import { Pulsar } from '../src/pulsar.js';
import { afterEach, beforeEach, expect, jest } from '@jest/globals';


describe('Pulsar Initialization', () => {
  let pulsar;

  beforeEach(() => {
    pulsar = new Pulsar();
    window.pulsar = undefined; // clean slate
  });

  describe('in embedded context', () => {
    beforeEach( () => {
      // mock window.parent.pulsar
      window.pulsar = {
        bridge: {
          init: jest.fn(),
          send: jest.fn()
        }
      };
    });
    test('initializes properly', async () => {
      await pulsar.init();
      expect(pulsar.isInitialized).toBe(true);
      expect(typeof pulsar.bridge.send).toBe('function');
    });
  });


  describe('when in native context via WebViewJavascriptBridgeReady event', () => {
    let listeners = {};
    const mockSend = jest.fn();
    const fakeBridge = {};
    beforeEach( () => {
      // Create and attach a listener map to simulate add/remove behavior
      listeners = {};
      global.document.addEventListener = (event, cb) => {
        listeners[event] = cb;
      };
      global.document.removeEventListener = (event) => {
        delete listeners[event];
      };
      fakeBridge.send = mockSend;
      fakeBridge.init = jest.fn();
    });

    test('it should initialize properly', async () => {
      // Trigger init (should register listener but not resolve yet)
      const initPromise = pulsar.init();

      // Simulate native bridge dispatching the event
      listeners['WebViewJavascriptBridgeReady']({ bridge: fakeBridge });

      const result = await initPromise;

      expect(pulsar.isInitialized).toBe(true);
      expect(pulsar.bridge).toBe(fakeBridge);
      expect(result).toBe(pulsar);
    });

    describe('when the version is undefined', () => {
      let logSpy = undefined;
      beforeEach( () => {
        fakeBridge.version = undefined;
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      });
      afterEach( () => {
        logSpy.mockRestore();
      });
      test('init should be called on the bridge', async () => {
        const initPromise = pulsar.init();

        // Simulate native bridge dispatching the event
        listeners['WebViewJavascriptBridgeReady']({ bridge: fakeBridge });

        const result = await initPromise;

        expect(pulsar.isInitialized).toBe(true);
        expect(fakeBridge.init).toHaveBeenCalled();
      });
    });

    describe('when the version is defined', () => {
      beforeEach( () => {
        fakeBridge.version = 13.0;
      });
      test('init should be called on the bridge', async () => {
        const initPromise = pulsar.init();
        // Simulate native bridge dispatching the event
        listeners['WebViewJavascriptBridgeReady']({ bridge: fakeBridge });

        const result = await initPromise;

        expect(pulsar.isInitialized).toBe(true);
        expect(fakeBridge.init).not.toHaveBeenCalled();
      });
    });

    describe('when the bridge event is never received', () => {
      beforeEach( () => {
        jest.useFakeTimers();
      });
      afterEach( () => {
        jest.useRealTimers();
      });
      test('it should fail after a reasonable amount of time and reject with an error message.', async () => {
        const initPromise = pulsar.init();
        // Fast-forward past the 5-second timeout
        jest.advanceTimersByTime(5000);
        await expect(initPromise).rejects.toThrow("Pulsar bridge initialization timed out");
      })
    });
  });

  test('throws if bridge is not initialized before read', async () => {
    await expect(pulsar.read('Account', {})).rejects.toThrow('Pulsar bridge not initialized');
  });

  describe('after initialization', () => {
    beforeEach( async () => {
      // mock window.parent.pulsar
      window.pulsar = {
        bridge: {
          init: jest.fn(),
          send: jest.fn()
        }
      };
      await pulsar.init();
      expect(pulsar.isInitialized).toBe(true);
      expect(typeof pulsar.bridge.send).toBe('function');
    });

    test('further calls to init should reject with an error message', async () => {
      // Second init should reject
      await expect(pulsar.init()).rejects.toThrow("Pulsar is already initialized.");
    });

  });
});
