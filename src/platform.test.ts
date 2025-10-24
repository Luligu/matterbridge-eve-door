import path from 'node:path';

import { MatterbridgeEndpoint, PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { Identify } from 'matterbridge/matter/clusters';
import { AnsiLogger } from 'matterbridge/logger';
import { jest } from '@jest/globals';

import { EveDoorPlatform } from './platform.ts';
import { setupTest } from './jestHelpers.ts';

// Setup the test environment
setupTest('Platform', false);

describe('TestPlatform', () => {
  let testPlatform: EveDoorPlatform;

  const mockLog = {
    fatal: jest.fn((message: string, ...parameters: any[]) => {}),
    error: jest.fn((message: string, ...parameters: any[]) => {}),
    warn: jest.fn((message: string, ...parameters: any[]) => {}),
    notice: jest.fn((message: string, ...parameters: any[]) => {}),
    info: jest.fn((message: string, ...parameters: any[]) => {}),
    debug: jest.fn((message: string, ...parameters: any[]) => {}),
  } as unknown as AnsiLogger;

  const mockConfig: PlatformConfig = {
    name: 'matterbridge-eve-door',
    type: 'DynamicPlatform',
    version: '1.0.0',
    unregisterOnShutdown: false,
    debug: false,
  };

  const mockMatterbridge = {
    homeDirectory: path.join('jest', 'Platform'),
    matterbridgeDirectory: path.join('jest', 'Platform', '.matterbridge'),
    matterbridgePluginDirectory: path.join('jest', 'Platform', 'Matterbridge'),
    matterbridgeCertDirectory: path.join('jest', 'Platform', '.mattercert'),
    systemInformation: { ipv4Address: undefined, ipv6Address: undefined, osRelease: 'xx.xx.xx.xx.xx.xx', nodeVersion: '22.1.10' },
    matterbridgeVersion: '3.3.0',
    log: mockLog,
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
  } as unknown as PlatformMatterbridge;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not initialize platform with wrong version', () => {
    mockMatterbridge.matterbridgeVersion = '1.5.0';
    expect(() => (testPlatform = new EveDoorPlatform(mockMatterbridge, mockLog, mockConfig))).toThrow();
    mockMatterbridge.matterbridgeVersion = '3.3.0';
  });

  it('should initialize platform with config name', () => {
    testPlatform = new EveDoorPlatform(mockMatterbridge, mockLog, mockConfig);
    expect(mockLog.info).toHaveBeenCalledWith('Initializing platform:', mockConfig.name);
  });

  it('should call onStart with reason', async () => {
    await testPlatform.onStart('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith('onStart called with reason:', 'Test reason');
    expect(testPlatform.door).toBeDefined();
    if (!testPlatform.door) return;
    expect(Object.keys(testPlatform.door.behaviors.supported)).toHaveLength(6); // ["descriptor", "matterbridge", "identify", "booleanState", "powerSource", "eveHistory"]
  });

  it('should call onConfigure', async () => {
    expect(testPlatform.door).toBeDefined();
    if (!testPlatform.door) return;
    expect(Object.keys(testPlatform.door.behaviors.supported)).toHaveLength(6); // ["descriptor", "matterbridge", "identify", "booleanState", "powerSource", "eveHistory"]

    jest.useFakeTimers();

    await testPlatform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith('onConfigure called');

    for (let i = 0; i < 100; i++) jest.advanceTimersByTime(61 * 1000);

    expect(mockLog.info).toHaveBeenCalledTimes(1);
    expect(mockLog.error).toHaveBeenCalledTimes(0);

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
    expect(mockLog.info).toHaveBeenCalledWith('onShutdown called with reason:', 'Test reason');
  });
});
