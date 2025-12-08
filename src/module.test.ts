const MATTER_PORT = 6000;
const NAME = 'Platform';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';

import { PlatformConfig } from 'matterbridge';
import { Identify } from 'matterbridge/matter/clusters';
import { LogLevel } from 'matterbridge/logger';
import { jest } from '@jest/globals';
import {
  createMatterbridgeEnvironment,
  destroyMatterbridgeEnvironment,
  loggerLogSpy,
  setupTest,
  startMatterbridgeEnvironment,
  stopMatterbridgeEnvironment,
  matterbridge,
  addMatterbridgePlatform,
  log,
} from 'matterbridge/jestutils';

import initializePlugin, { EveDoorPlatform } from './module.js';

// Setup the test environment
setupTest(NAME, false);

describe('TestPlatform', () => {
  let testPlatform: EveDoorPlatform;

  const config: PlatformConfig = {
    name: 'matterbridge-eve-door',
    type: 'AccessoryPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  beforeAll(async () => {
    await createMatterbridgeEnvironment(NAME);
    await startMatterbridgeEnvironment(MATTER_PORT);
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await stopMatterbridgeEnvironment();
    await destroyMatterbridgeEnvironment();
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
    matterbridge.matterbridgeVersion = '3.4.0';
  });

  it('should initialize platform with config name', () => {
    matterbridge.plugins.logLevel = LogLevel.DEBUG;
    testPlatform = new EveDoorPlatform(matterbridge, log, config);
    addMatterbridgePlatform(testPlatform);
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

    // Simulate multiple interval executions
    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(61 * 1000);
    }

    jest.useRealTimers();

    expect(loggerLogSpy).toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Set contact to true');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Set contact to false');
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
