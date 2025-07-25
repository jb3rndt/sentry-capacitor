/* eslint-disable @typescript-eslint/unbound-method */
import type { Envelope, EventEnvelope, EventItem, SeverityLevel, TransportMakeRequestResponse } from '@sentry/core';
import {createEnvelope, dropUndefinedKeys, logger} from '@sentry/core';
import { utf8ToBytes } from '../src/vendor';
import { NATIVE } from '../src/wrapper';

let getStringBytesLengthValue = 1;

function NumberArrayToString(numberArray: number[]): string {
  return new TextDecoder().decode(new Uint8Array(numberArray).buffer);
}

jest.mock(
  '@capacitor/core',
  () => {
    const original = jest.requireActual('@capacitor/core');

    return {
      WebPlugin: original.WebPlugin,
      registerPlugin: jest.fn(),
      Capacitor: {
        isPluginAvailable: jest.fn(() => true),
        getPlatform: jest.fn(() => 'android'),
      },
    };
  },
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true },
);

jest.mock('../src/plugin', () => {
  return {
    SentryCapacitor: {
      addBreadcrumb: jest.fn(),
      captureEnvelope: jest.fn(envelope => Promise.resolve(envelope)),
      crash: jest.fn(),
      fetchNativeRelease: jest.fn(() =>
        Promise.resolve({
          build: '0.0.1',
          id: 'test-mock',
          version: '0.0.1',
        }),
      ),
      fetchNativeDeviceContexts: jest.fn(() =>
        Promise.resolve({
          someContext: {
            someValue: 0,
          },
        })
      ),
      getStringBytesLength: jest.fn(() =>
        Promise.resolve({
          value: getStringBytesLengthValue,
        }),
      ),
      initNativeSdk: jest.fn(options => Promise.resolve(options)),
      setContext: jest.fn(() => Promise.resolve()),
      setExtra: jest.fn(() => Promise.resolve()),
      setTag: jest.fn(() => Promise.resolve()),
      setUser: jest.fn(() => {
        return;
      }),
      closeNativeSdk: jest.fn(() => Promise.resolve()),
    },
  };
});

import { SentryCapacitor } from '../src/plugin';

beforeEach(() => {
  getStringBytesLengthValue = 1;
  NATIVE.enableNative = true;
  NATIVE.platform = 'android';
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Tests Native Wrapper', () => {
  describe('initNativeSdk', () => {
    test('calls plugin', async () => {
      SentryCapacitor.initNativeSdk = jest.fn();

      await NATIVE.initNativeSdk({ dsn: 'test', enableNative: true });

      expect(SentryCapacitor.initNativeSdk).toHaveBeenCalled();
    });

    test('Vue and App options to be removed', async () => {

      const initNativeSdk = jest.spyOn(SentryCapacitor, 'initNativeSdk');

      // @ts-ignore ignore app and vue since they are part of Sentry/Vue and not Capacitor.
      await NATIVE.initNativeSdk({ dsn: 'test', enableNative: true, app: 'test', vue: 'test' });

      const nativeOption = initNativeSdk.mock.calls[0][0].options;
      expect(SentryCapacitor.initNativeSdk).toHaveBeenCalledTimes(1);
      // @ts-ignore Not part of Capacitor Options but it is extended by Vue Options.
      expect(nativeOption.app).toBeUndefined();
      // @ts-ignore Not part of Capacitor Options but it is extended by Vue Options.
      expect(nativeOption.vue).toBeUndefined();

      expect(initNativeSdk).toHaveBeenCalled();
    });


    test('default options to be removed', async () => {
      const initNativeSdk = jest.spyOn(SentryCapacitor, 'initNativeSdk');
      await NATIVE.initNativeSdk(
        {
          dsn: 'test',
          enableNative: true,
          integrations: [],
          defaultIntegrations: [],
          beforeSend: ((event) => event),
          beforeBreadcrumb: ((breadcrumb) => breadcrumb),
          beforeSendTransaction: (transaction) => transaction,
          transport: jest.fn(),
          tracesSampler: jest.fn(),
        });

      const nativeOption = initNativeSdk.mock.calls[0][0].options;
      expect(SentryCapacitor.initNativeSdk).toHaveBeenCalledTimes(1);
      // @ts-ignore Not part of Capacitor Options but it is extended by Vue Options.
      expect(nativeOption.integrations).toBeUndefined();
      expect(nativeOption.defaultIntegrations).toBeUndefined();
      expect(nativeOption.beforeSend).toBeUndefined();
      expect(nativeOption.beforeSendTransaction).toBeUndefined();
      expect(nativeOption.beforeBreadcrumb).toBeUndefined();
      expect(nativeOption.transport).toBeUndefined();
      expect(nativeOption.tracesSampler).toBeUndefined();

      expect(initNativeSdk).toHaveBeenCalled();
    });

    test('warns if there is no dsn', async () => {
      SentryCapacitor.initNativeSdk = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.initNativeSdk({ enableNative: true });

      expect(SentryCapacitor.initNativeSdk).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(logger.warn).toHaveBeenLastCalledWith(
        'Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized.',
      );
    });

    test('does not call native module with enableNative: false', async () => {
      SentryCapacitor.initNativeSdk = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.initNativeSdk({
        dsn: 'test',
        enableNative: false,
        enableNativeNagger: true,
      });

      expect(SentryCapacitor.initNativeSdk).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(logger.warn).toHaveBeenLastCalledWith(
        'Note: Native Sentry SDK is disabled.',
      );
    });

    test('sets enableNative: false when dsn is undefined', async () => {
      await NATIVE.initNativeSdk({
        dsn: undefined,
      });

      expect(NATIVE.enableNative).toBe(false);
    });
  });

  describe('sendEnvelope', () => {
    test('calls getStringBytesLength and captureEnvelope', async () => {
      const expectedNativeLength = 101;
      getStringBytesLengthValue = expectedNativeLength;

      const event = {
        event_id: 'event0',
        message: 'test©',
        sdk: {
          name: 'test-sdk-name',
          version: '1.2.3',
        },
      };

      const expectedHeader = JSON.stringify({
        event_id: event.event_id,
        sent_at: '123'
      });
      const expectedItem = JSON.stringify({
        type: 'event',
        content_type: 'application/vnd.sentry.items.log+json',
        length: expectedNativeLength,
      });
      const expectedPayload = JSON.stringify({
        ...event,
        message: {
          message: event.message,
        },
      });

      const expectedEnvelope = `${expectedHeader}\n${expectedItem}\n${expectedPayload}\n`;

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      await NATIVE.sendEnvelope(env);

      expect(SentryCapacitor.captureEnvelope).toHaveBeenCalledWith({ envelope: utf8ToBytes(expectedEnvelope) });
    });

    test('does not call Capacitor at all if enableNative is false', async () => {
      try {
        await NATIVE.initNativeSdk({ dsn: 'test-dsn', enableNative: false });
        await NATIVE.sendEnvelope({} as Envelope);
      } catch (error) {
        // @ts-ignore it is an error.
        expect(error.message).toMatch('Native is disabled');
      }

      expect(SentryCapacitor.getStringBytesLength).not.toHaveBeenCalled();
      expect(SentryCapacitor.captureEnvelope).not.toHaveBeenCalled();
    });

    test('Clears breadcrumbs on Android if there is no exception', async () => {
      NATIVE.platform = 'android';

      const event = {
        event_id: 'event0',
        message: 'test',
        breadcrumbs: [
          {
            message: 'crumb!',
          },
        ],
        sdk: {
          name: 'test-sdk-name',
          version: '1.2.3',
        },
      };

      const expectedHeader = JSON.stringify({
        event_id: event.event_id,
        sent_at: '123'
      });
      const expectedItem = JSON.stringify({
        type: 'event',
        content_type: 'application/vnd.sentry.items.log+json',
        length: 116,
      });
      const expectedPayload = JSON.stringify({
        ...event,
        breadcrumbs: [],
        message: {
          message: event.message,
        },
      });

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      const captureEnvelopeSpy = jest.spyOn(SentryCapacitor, 'captureEnvelope');

      await NATIVE.sendEnvelope(env);

      expect(SentryCapacitor.captureEnvelope).toHaveBeenCalledTimes(1);
      expect(NumberArrayToString(captureEnvelopeSpy.mock.calls[0][0].envelope)).toMatch(
        `${expectedHeader}\n${expectedItem}\n${expectedPayload}`);
    });

    test('Has a valid EOF string', async () => {
      const [expectedEOF = -1/* Placeholder */] = utf8ToBytes('\n');
      const expectedEnvelopeBytes = utf8ToBytes(JSON.stringify({ foo: 'bar' }));
      expectedEnvelopeBytes.push(expectedEOF);

      const captureEnvelopeSpy = jest.spyOn(SentryCapacitor, 'captureEnvelope');

      const mockedEnvelope: Envelope = [{ foo: 'bar' }, []];

      await NATIVE.sendEnvelope(mockedEnvelope);

      expect(expectedEOF).not.toBe(-1);
      expect(SentryCapacitor.captureEnvelope).toHaveBeenCalledTimes(1);
      expect(captureEnvelopeSpy.mock.calls[0][0].envelope).toEqual(expectedEnvelopeBytes);
    });

    test('Clears breadcrumbs on Android if there is a handled exception', async () => {
      NATIVE.platform = 'android';

      const event = {
        event_id: 'event0',
        message: 'test',
        breadcrumbs: [
          {
            message: 'crumb!',
          },
        ],
        exception: {
          values: [{
            mechanism: {
              handled: true
            }
          }]
        },
        sdk: {
          name: 'test-sdk-name',
          version: '1.2.3',
        },
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      const expectedHeader = JSON.stringify({
        event_id: event.event_id,
        sent_at: '123'
      });
      const expectedItem = JSON.stringify({
        type: 'event',
        content_type: 'application/vnd.sentry.items.log+json',
        length: 172,
      });
      const expectedPayload = JSON.stringify({
        ...event,
        breadcrumbs: [],
        message: {
          message: event.message,
        },
        exception: {
          values: [{
            mechanism: {
              handled: true
            }
          }]
        }
      });

      const captureEnvelopeSpy = jest.spyOn(SentryCapacitor, 'captureEnvelope');

      await NATIVE.sendEnvelope(env);

      expect(SentryCapacitor.captureEnvelope).toHaveBeenCalledTimes(1);
      expect(NumberArrayToString(captureEnvelopeSpy.mock.calls[0][0].envelope)).toMatch(
        `${expectedHeader}\n${expectedItem}\n${expectedPayload}\n`);
    });

    test('Clears breadcrumbs on Android if there is a handled exception', async () => {
      NATIVE.platform = 'android';

      const event = {
        event_id: 'event0',
        message: 'test',
        breadcrumbs: [
          {
            message: 'crumb!',
          },
        ],
        exception: {
          values: [{
            mechanism: {
              handled: true
            }
          }]
        },
        sdk: {
          name: 'test-sdk-name',
          version: '1.2.3',
        },
      };

      const expectedHeader = JSON.stringify({
        event_id: event.event_id,
        sent_at: '123'
      });
      const expectedItem = JSON.stringify({
        type: 'event',
        content_type: 'application/vnd.sentry.items.log+json',
        length: 172,
      });
      const expectedPayload = JSON.stringify({
        ...event,
        breadcrumbs: [],
        message: {
          message: event.message,
        },
        exception: {
          values: [{
            mechanism: {
              handled: true
            }
          }]
        }
      });

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      const captureEnvelopeSpy = jest.spyOn(SentryCapacitor, 'captureEnvelope');

      await NATIVE.sendEnvelope(env);

      expect(SentryCapacitor.captureEnvelope).toHaveBeenCalledTimes(1);
      expect(NumberArrayToString(captureEnvelopeSpy.mock.calls[0][0].envelope)).toMatch(
        `${expectedHeader}\n${expectedItem}\n${expectedPayload}\n`);
    });

    test('has statusCode 200 on success', async () => {
      const captureEnvelopeSpy = jest.spyOn(SentryCapacitor, 'captureEnvelope');
      captureEnvelopeSpy.mockResolvedValue(true);

      const event = {
        event_id: 'event0',
        message: 'test',
        sdk: {
          name: 'test-sdk-name',
          version: '2.1.3',
        },
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      const expectedReturn = {
        statusCode: 200,
      } as TransportMakeRequestResponse;
      NATIVE.enableNative = true;
      const result = await NATIVE.sendEnvelope(env);
      expect(result).toMatchObject(expectedReturn);
    });

    test('has statusCode 500 if failed', async () => {
      const captureEnvelopeSpy = jest.spyOn(SentryCapacitor, 'captureEnvelope');
      captureEnvelopeSpy.mockRejectedValue(false);

      const event = {
        event_id: 'event0',
        message: 'test',
        sdk: {
          name: 'test-sdk-name',
          version: '2.1.3',
        },
      };

      const env = createEnvelope<EventEnvelope>({ event_id: event.event_id, sent_at: '123' }, [
        [{ type: 'event' }, event] as EventItem,
      ]);

      const expectedReturn = {
        statusCode: 500,
      } as TransportMakeRequestResponse;
      NATIVE.enableNative = true;
      const result = await NATIVE.sendEnvelope(env);
      expect(result).toMatchObject(expectedReturn);
    })
  });

  // TODO add this in when fetchRelease method is in progress
  // describe('fetchRelease', () => {
  //   test('fetches the release from native', async () => {
  //     await expect(NATIVE.fetchRelease()).resolves.toMatchObject({
  //       build: '0.0.1',
  //       id: 'test-mock',
  //       version: '0.0.1',
  //     });
  //   });
  // });

  describe('isModuleLoaded', () => {
    test('returns true when module is loaded', () => {
      expect(NATIVE.isModuleLoaded()).toBe(true);
    });
  });

  describe('crash', () => {
    test('calls the native crash', () => {
      NATIVE.crash();

      expect(SentryCapacitor.crash).toHaveBeenCalled();
    });
  });

  describe('setUser', () => {
    test('serializes all user object keys', async () => {
      NATIVE.setUser({
        email: 'hello@sentry.io',
        // @ts-ignore Intentional incorrect type to simulate using a double as an id (We had a user open an issue because this didn't work before)
        id: '3.1234587',
        unique: '123',
      });

      expect(SentryCapacitor.setUser).toHaveBeenCalledWith({
        defaultUserKeys: {
          email: 'hello@sentry.io',
          id: '3.1234587',
        },
        otherUserKeys: {
          unique: '123',
        },
      });
    });

    test('calls native setUser with empty object as second param if no unique keys', async () => {
      NATIVE.setUser({
        id: 'Hello',
      });

      expect(SentryCapacitor.setUser).toHaveBeenCalledWith({
        defaultUserKeys: {
          id: 'Hello',
        },
        otherUserKeys: {},
      });
    });
  });

  describe('setTag', () => {
    it('calls setTag', () => {
      NATIVE.setTag('key', 'value');

      expect(SentryCapacitor.setTag).toHaveBeenCalledWith({
        key: 'key',
        value: 'value',
      });
    });

    it('serializes number', () => {
      // @ts-ignore test number
      NATIVE.setTag('key', 0);

      expect(SentryCapacitor.setTag).toHaveBeenCalledWith({
        key: 'key',
        value: '0',
      });
    });

    it('serializes object', () => {
      // @ts-ignore test number
      NATIVE.setTag('key', {});

      expect(SentryCapacitor.setTag).toHaveBeenCalledWith({
        key: 'key',
        value: '{}',
      });
    });
  });

  describe('setExtra', () => {
    it('calls setExtra', () => {
      NATIVE.setExtra('key', { hello: 'world' });

      expect(SentryCapacitor.setExtra).toHaveBeenCalledWith({
        key: 'key',
        value: '{"hello":"world"}',
      });
    });
  });

  describe('setContext', () => {
    it('calls setContext', () => {
      NATIVE.platform = 'ios';

      NATIVE.setContext('key', { hello: 'world' });

      expect(SentryCapacitor.setContext).toHaveBeenCalledWith({
        key: 'key',
        value: { hello: 'world' },
      });
    });

    it('calls setContext with null', () => {
      NATIVE.platform = 'ios';

      NATIVE.setContext('key', null);

      expect(SentryCapacitor.setContext).toHaveBeenCalledWith({
        key: 'key',
        value: null,
      });
    });

    it('calls setExtra on android', () => {
      NATIVE.platform = 'android';

      NATIVE.setContext('key', { hello: 'world' });

      expect(SentryCapacitor.setExtra).toHaveBeenCalledWith({
        key: 'key',
        value: '{"hello":"world"}',
      });
    });
  });

  describe('_processLevel', () => {
    test('converts deprecated levels', () => {
      expect(NATIVE._processLevel('log' as SeverityLevel)).toBe('debug' as SeverityLevel);
      expect(NATIVE._processLevel('critical' as SeverityLevel)).toBe('fatal' as SeverityLevel);
    });
    test('returns non-deprecated levels', () => {
      expect(NATIVE._processLevel('debug' as SeverityLevel)).toBe('debug' as SeverityLevel);
      expect(NATIVE._processLevel('fatal' as SeverityLevel)).toBe('fatal' as SeverityLevel);
      expect(NATIVE._processLevel('info' as SeverityLevel)).toBe('info' as SeverityLevel);
      expect(NATIVE._processLevel('warning' as SeverityLevel)).toBe('warning' as SeverityLevel);
      expect(NATIVE._processLevel('error' as SeverityLevel)).toBe('error' as SeverityLevel);
    });
  });

  describe('isNativeClientAvailable', () => {
    test('checks if native client is available', () => {
      expect(NATIVE.isNativeClientAvailable()).toBe(true);
    });
  });

  describe('deviceContexts', () => {
    test('returns context object from native module on ios', async () => {
      NATIVE.platform = 'ios';

      await expect(NATIVE.fetchNativeDeviceContexts()).resolves.toMatchObject({
        someContext: {
          someValue: 0,
        },
      });

      expect(SentryCapacitor.fetchNativeDeviceContexts).toHaveBeenCalled();
    });
    test('returns empty object on android', async () => {
      NATIVE.platform = 'android';

      await expect(NATIVE.fetchNativeDeviceContexts()).resolves.toMatchObject(
        {}
      );

      expect(SentryCapacitor.fetchNativeDeviceContexts).not.toHaveBeenCalled();
    });
  });

  describe('closeNativeSdk', () => {
    test('closeNativeSdk calls native bridge', async () => {
      await NATIVE.closeNativeSdk();

      expect(SentryCapacitor.closeNativeSdk).toHaveBeenCalled();
      expect(NATIVE.enableNative).toBe(false);
    });
  });

  describe('_serializeObject', () => {

    test('serializes simple object', () => {

      const data = { valid: true, undefinedKey: undefined, stringData: 'data' };
      const serializedData = NATIVE._serializeObject(data);

      expect(serializedData).toEqual(
        {
          'stringData': 'data',
          'undefinedKey': undefined,
          'valid': 'true'
        });
    });

    test('serializes simple object AND removes undefined values', () => {

      const data = { valid: true, undefinedKey: undefined, stringData: 'data' };
      const serializedData = NATIVE._serializeObject(data, true);

      expect(serializedData).toEqual(
        {
          'stringData': 'data',
          'valid': 'true'
        });
    });

    test('undefined removal behaves the same as dropUndefinedKeys', () => {

      const data = { valid: true, undefinedKey: undefined, stringData: 'data' };
      // eslint-disable-next-line deprecation/deprecation
      const oldSerializedData = dropUndefinedKeys(NATIVE._serializeObject(data));

      const newSerializedData = NATIVE._serializeObject(data, true);

      expect(newSerializedData).toEqual(oldSerializedData);
    });

    test('serializes complex object', () => {

      const subData = { data1: 1, data2: 2, undefinedData: undefined, data3: { dataA: 'A', dataB: 0.9 } };
      const data = { valid: true, undefinedKey: undefined, stringData: 'data', subData: subData };
      const serializedData = NATIVE._serializeObject(data);

      expect(serializedData).toEqual(
        {
          'stringData': 'data',
          'subData': '{"data1":1,"data2":2,"data3":{"dataA":"A","dataB":0.9}}',
          'undefinedKey': undefined,
          'valid': 'true'
        });

    });

    test('serializes complex object AND removes undefined values', () => {

      const subData = { data1: 1, data2: 2, undefinedData: undefined, data3: { dataA: 'A', dataB: 0.9 } };
      const data = { valid: true, undefinedKey: undefined, stringData: 'data', subData: subData };
      const serializedData = NATIVE._serializeObject(data, true);

      expect(serializedData).toEqual(
        {
          'stringData': 'data',
          'subData': '{"data1":1,"data2":2,"data3":{"dataA":"A","dataB":0.9}}',
          'valid': 'true'
        });
    });

  });

  test('closeNativeSdk called twice does not throw error.', async () => {
    logger.debug = jest.fn();
    await NATIVE.closeNativeSdk();
    expect(logger.debug).not.toHaveBeenCalled();

    await NATIVE.closeNativeSdk();
    expect(logger.debug).toHaveBeenCalledWith(NATIVE._DisabledNativeError);
  });
});
