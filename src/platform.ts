import { MatterHistory } from 'matter-history';
import { PlatformConfig, PlatformMatterbridge, MatterbridgeAccessoryPlatform, powerSource, MatterbridgeEndpoint, contactSensor } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { BooleanState, PowerSource } from 'matterbridge/matter/clusters';

export class EveDoorPlatform extends MatterbridgeAccessoryPlatform {
  door: MatterbridgeEndpoint | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.3.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.3.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve door', { filePath: this.matterbridge.matterbridgeDirectory, enableDebug: this.config.debug as boolean });

    this.door = new MatterbridgeEndpoint(
      [contactSensor, powerSource],
      { uniqueStorageKey: 'Eve door', mode: this.matterbridge.bridgeMode === 'bridge' ? 'server' : undefined },
      this.config.debug as boolean,
    );
    this.door.createDefaultIdentifyClusterServer();
    this.door.createDefaultBasicInformationClusterServer('Eve door', '0x88030475', 4874, 'Eve Systems', 77, 'Eve Door 20EBN9901', 1144, '1.2.8');
    this.door.createDefaultBooleanStateClusterServer(true);
    this.door.createDefaultPowerSourceReplaceableBatteryClusterServer(75, PowerSource.BatChargeLevel.Ok, 3000, 'CR2450', 1);

    // Add the EveHistory cluster to the device as last cluster and call autoPilot
    this.history.createDoorEveHistoryClusterServer(this.door, this.log);
    this.history.autoPilot(this.door);

    await this.registerDevice(this.door);

    this.door.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.info(`Command identify called identifyTime ${identifyTime}`);
      this.history?.logHistory(false);
    });

    this.door.addCommandHandler('triggerEffect', async ({ request: { effectIdentifier, effectVariant } }) => {
      this.log.info(`Command triggerEffect called effect ${effectIdentifier} variant ${effectVariant}`);
      this.history?.logHistory(false);
    });
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    this.interval = setInterval(
      async () => {
        if (!this.door || !this.history) return;
        let contact = this.door.getAttribute(BooleanState.Cluster.id, 'stateValue', this.log);
        contact = !contact;
        await this.door.setAttribute(BooleanState.Cluster.id, 'stateValue', contact, this.log);
        await this.door.triggerEvent(BooleanState.Cluster.id, 'stateChange', { stateValue: contact }, this.log);
        if (contact === false) this.history.addToTimesOpened();
        this.history.setLastEvent();
        this.history.addEntry({ time: this.history.now(), contact: contact === true ? 0 : 1 });
        this.log.info(`Set contact to ${contact}`);

        let batteryLevel = this.door.getAttribute(PowerSource.Cluster.id, 'batPercentRemaining', this.log);
        batteryLevel = batteryLevel + 20 > 200 ? 10 : batteryLevel + 10;
        await this.door.setAttribute(PowerSource.Cluster.id, 'batPercentRemaining', batteryLevel, this.log);
        if (batteryLevel >= 40) {
          await this.door.setAttribute(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, this.log);
        } else if (batteryLevel >= 20) {
          await this.door.setAttribute(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Warning, this.log);
        } else {
          await this.door.setAttribute(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Critical, this.log);
        }
      },
      60 * 1000 + 100,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    await this.history?.close();
    clearInterval(this.interval);
    this.interval = undefined;
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
