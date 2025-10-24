const MATTER_PORT = 6000;
const NAME = 'Platform';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';

import { Matterbridge, PlatformConfig } from 'matterbridge';
import { Identify } from 'matterbridge/matter/clusters';
import { AnsiLogger, LogLevel, TimestampFormat } from 'matterbridge/logger';
import { jest } from '@jest/globals';
import { Endpoint, ServerNode } from 'matterbridge/matter';
import { AggregatorEndpoint } from 'matterbridge/matter/endpoints';

import initializePlugin, { EveDoorPlatform } from './module.js';
import {
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  loggerLogSpy,
  setDebug,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
} from './jestHelpers.ts';

// Setup the test environment
setupTest(NAME, false);

describe('TestPlatform', () => {
  let matterbridge: Matterbridge;
  let server: ServerNode<ServerNode.RootEndpoint>;
  let aggregator: Endpoint<AggregatorEndpoint>;
  let testPlatform: EveDoorPlatform;
  let log: AnsiLogger;

  const config: PlatformConfig = {
    name: 'matterbridge-eve-door',
    type: 'DynamicPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  beforeAll(async () => {
    matterbridge = await createMatterbridgeEnvironment(NAME);
    [server, aggregator] = await startMatterbridgeEnvironment(matterbridge, MATTER_PORT);
    log = new AnsiLogger({ logName: NAME, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await stopMatterbridgeEnvironment(matterbridge, server, aggregator);
    await destroyMatterbridgeEnvironment(matterbridge);
    // Restore all mocks
    jest.restoreAllMocks();
  });

  it('should return an instance of TestPlatform', async () => {
    const platform = initializePlugin(matterbridge, log, config);
    expect(platform).toBeInstanceOf(EveDoorPlatform);
    await platform.onShutdown();
  });

  it('should not initialize platform with wrong version', () => {
    matterbridge.matterbridgeVersion = '1.5.0';
    expect(() => (testPlatform = new EveDoorPlatform(matterbridge, log, config))).toThrow();
    matterbridge.matterbridgeVersion = '3.3.0';
  });

  it('should initialize platform with config name', () => {
    matterbridge.plugins.logLevel = LogLevel.DEBUG;
    // @ts-expect-error accessing private member for testing
    matterbridge.plugins._plugins.set('matterbridge-jest', {});
    testPlatform = new EveDoorPlatform(matterbridge, log, config);
    testPlatform['name'] = 'matterbridge-jest';
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Initializing platform:', config.name);
  });

  it('should call onStart with reason', async () => {
    await testPlatform.onStart('Test reason');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onStart called with reason:', 'Test reason');
    expect(testPlatform.door).toBeDefined();
    if (!testPlatform.door) return;
    expect(testPlatform.door.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'identify', 'booleanState', 'powerSource', 'eveHistory']);
  });

  it('should call onConfigure', async () => {
    expect(testPlatform.door).toBeDefined();
    if (!testPlatform.door) return;

    jest.useFakeTimers();

    await testPlatform.onConfigure();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onConfigure called');

    for (let i = 0; i < 100; i++) jest.advanceTimersByTime(61 * 1000);

    expect(loggerLogSpy).toHaveBeenCalledTimes(102);
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());

    jest.useRealTimers();
  });

  it('should execute the commandHandlers', async () => {
    expect(testPlatform.door).toBeDefined();
    if (!testPlatform.door) return;
    expect(Object.keys(testPlatform.door.behaviors.supported)).toHaveLength(6); // ["descriptor", "matterbridge", "identify", "booleanState", "powerSource", "eveHistory"]
    await testPlatform.door.executeCommandHandler('identify', { identifyTime: 5 });
    await testPlatform.door.executeCommandHandler('triggerEffect', { effectIdentifier: Identify.EffectIdentifier.Blink, effectVariant: Identify.EffectVariant.Default });
  });

  it('should call onShutdown with reason', async () => {
    await testPlatform.onShutdown('Test reason');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'onShutdown called with reason:', 'Test reason');
  });
});
