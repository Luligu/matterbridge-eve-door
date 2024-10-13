import { DeviceTypes, BooleanState, PlatformConfig, Matterbridge, MatterbridgeDevice, MatterbridgeAccessoryPlatform, powerSource } from 'matterbridge';
import { MatterHistory } from 'matter-history';
import { AnsiLogger } from 'matterbridge/logger';

export class EveDoorPlatform extends MatterbridgeAccessoryPlatform {
  door: MatterbridgeDevice | undefined;
  history: MatterHistory | undefined;
  interval: NodeJS.Timeout | undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
    this.log.info('Initializing platform:', this.config.name);
  }

  override async onStart(reason?: string) {
    this.log.info('onStart called with reason:', reason ?? 'none');

    this.history = new MatterHistory(this.log, 'Eve door', { filePath: this.matterbridge.matterbridgeDirectory });

    this.door = new MatterbridgeDevice(DeviceTypes.CONTACT_SENSOR);
    this.door.createDefaultIdentifyClusterServer();
    this.door.createDefaultBasicInformationClusterServer('Eve door', '0x88030475', 4874, 'Eve Systems', 77, 'Eve Door 20EBN9901', 1144, '1.2.8');
    this.door.createDefaultBooleanStateClusterServer(true);

    this.door.addDeviceType(powerSource);
    this.door.createDefaultPowerSourceReplaceableBatteryClusterServer(75);

    // Add the EveHistory cluster to the device as last cluster and call autoPilot
    this.history.createDoorEveHistoryClusterServer(this.door, this.log);
    this.history.autoPilot(this.door);

    await this.registerDevice(this.door);

    this.door.addCommandHandler('identify', async ({ request: { identifyTime } }) => {
      this.log.warn(`Command identify called identifyTime:${identifyTime}`);
      this.history?.logHistory(false);
    });
  }

  override async onConfigure() {
    this.log.info('onConfigure called');

    this.interval = setInterval(
      () => {
        if (!this.door || !this.history) return;
        let contact = this.door.getClusterServerById(BooleanState.Cluster.id)?.getStateValueAttribute();
        contact = !contact;
        this.door.getClusterServerById(BooleanState.Cluster.id)?.setStateValueAttribute(contact);
        this.door.getClusterServerById(BooleanState.Cluster.id)?.triggerStateChangeEvent({ stateValue: contact });
        if (contact === false) this.history.addToTimesOpened();
        this.history.setLastEvent();
        this.history.addEntry({ time: this.history.now(), contact: contact === true ? 0 : 1 });
        this.log.info(`Set contact to ${contact}`);
      },
      60 * 1000 + 100,
    );
  }

  override async onShutdown(reason?: string) {
    this.log.info('onShutdown called with reason:', reason ?? 'none');
    await this.history?.close();
    clearInterval(this.interval);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }
}
