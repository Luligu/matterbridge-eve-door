/**
 * @file src/module.ts
 * @description This file contains the class EveDoorPlatform.
 * @author Luca Liguori
 * @created 2024-02-28
 * @version 2.0.0
 * @license Apache-2.0
 *
 * Copyright 2023, 2024, 2025, 2026 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { MatterHistory } from 'matter-history';
import { contactSensor, MatterbridgeAccessoryPlatform, MatterbridgeEndpoint, type PlatformConfig, type PlatformMatterbridge, powerSource } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { BooleanState, PowerSource } from 'matterbridge/matter/clusters';
import { fireAndForget } from 'matterbridge/utils';

/**
 * This is the standard interface for MatterBridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 *  @param {PlatformMatterbridge} matterbridge - The Matterbridge instance.
 *  @param {AnsiLogger} log - The logger instance for logging messages.
 *  @param {PlatformConfig} config - The configuration for the platform.
 *  @returns {EveDoorPlatform} - An instance of the EveDoorPlatform.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig): EveDoorPlatform {
  return new EveDoorPlatform(matterbridge, log, config);
}

export class EveDoorPlatform extends MatterbridgeAccessoryPlatform {
  door: MatterbridgeEndpoint | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.9.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.9.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve door', { filePath: this.matterbridge.matterbridgeDirectory, enableDebug: this.config.debug });

    this.door = new MatterbridgeEndpoint(
      [contactSensor, powerSource],
      { id: 'Eve door', mode: this.matterbridge.bridgeMode === 'bridge' ? 'server' : undefined },
      this.config.debug,
    );
    this.door.createDefaultIdentifyClusterServer();
    this.door.createDefaultBasicInformationClusterServer(
      'Eve door' + (this.matterbridge.bridgeMode === 'bridge' ? ' server' : ''),
      '0x88030475',
      4874,
      'Eve Systems',
      77,
      'Eve Door 20EBN9901',
      1144,
      '1.2.8',
    );
    this.door.createDefaultBooleanStateClusterServer(true);
    this.door.createDefaultPowerSourceReplaceableBatteryClusterServer(75, PowerSource.BatChargeLevel.Ok, 3000, 'CR2450', 1);
    this.door.addRequiredClusters();

    // Add the EveHistory cluster to the device as last cluster and call autoPilot
    this.history.createDoorEveHistoryClusterServer(this.door, this.log);

    await this.registerDevice(this.door);

    this.history.autoPilot(this.door);

    this.door.addCommandHandler('identify', ({ request: { identifyTime } }) => {
      this.log.info(`Command identify called identifyTime ${identifyTime}`);
      this.history?.logHistory(false);
    });

    this.door.addCommandHandler('triggerEffect', ({ request: { effectIdentifier, effectVariant } }) => {
      this.log.info(`Command triggerEffect called effect ${effectIdentifier} variant ${effectVariant}`);
      this.history?.logHistory(false);
    });
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.log.info('onConfigure called');

    this.interval = setInterval(
      () => {
        fireAndForget(
          (async (): Promise<void> => {
            /* v8 ignore next */
            if (!this.door || !this.history) return;
            let contact = this.door.getAttribute(BooleanState, 'stateValue', this.log);
            contact = !contact;
            await this.door.setAttribute(BooleanState, 'stateValue', contact, this.log);
            await this.door.triggerEvent(BooleanState, 'stateChange', { stateValue: contact }, this.log);
            if (!contact) this.history.addToTimesOpened();
            this.history.setLastEvent();
            this.history.addEntry({ time: this.history.now(), contact: contact ? 0 : 1 });
            this.log.info(`Set contact to ${contact}`);

            let batteryLevel = this.door.getAttribute(PowerSource, 'batPercentRemaining', this.log) ?? 0;
            batteryLevel = batteryLevel + 20 > 200 ? 10 : batteryLevel + 10;
            await this.door.setAttribute(PowerSource, 'batPercentRemaining', batteryLevel, this.log);
            if (batteryLevel >= 40) {
              await this.door.setAttribute(PowerSource, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, this.log);
            } else if (batteryLevel >= 20) {
              await this.door.setAttribute(PowerSource, 'batChargeLevel', PowerSource.BatChargeLevel.Warning, this.log);
            } else {
              await this.door.setAttribute(PowerSource, 'batChargeLevel', PowerSource.BatChargeLevel.Critical, this.log);
            }
          })(),
          this.log,
          'setInterval',
        );
      },
      60 * 1000 + 100,
    );
  }

  override async onShutdown(reason?: string): Promise<void> {
    await super.onShutdown(reason);
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    await this.history?.close();
    clearInterval(this.interval);
    this.interval = undefined;
    if (this.config.unregisterOnShutdown) await this.unregisterAllDevices();
  }
}
