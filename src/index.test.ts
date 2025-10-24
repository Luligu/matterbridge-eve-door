import path from 'node:path';

import { MatterbridgeEndpoint, PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { jest } from '@jest/globals';

import { EveDoorPlatform } from './platform.ts';
import initializePlugin from './index.ts';
import { setupTest } from './jestHelpers.ts';

// Setup the test environment
setupTest('Index', false);

describe('initializePlugin', () => {
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
    homeDirectory: path.join('jest', 'Index'),
    matterbridgeDirectory: path.join('jest', 'Index', '.matterbridge'),
    matterbridgePluginDirectory: path.join('jest', 'Index', 'Matterbridge'),
    matterbridgeCertDirectory: path.join('jest', 'Index', '.mattercert'),
    systemInformation: { ipv4Address: undefined, ipv6Address: undefined, osRelease: 'xx.xx.xx.xx.xx.xx', nodeVersion: '22.1.10' },
    matterbridgeVersion: '3.3.0',
    log: mockLog,
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
  } as unknown as PlatformMatterbridge;

  it('should return an instance of TestPlatform', async () => {
    const platform = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(platform).toBeInstanceOf(EveDoorPlatform);
    await platform.onShutdown();
  });
});
