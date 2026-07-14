/* eslint-disable @typescript-eslint/naming-convention */
import type { ExecutionEnvironment, RuntimeProvider } from '@tutorialkit/runtime';
import type { RuntimeConfig } from '@tutorialkit/types';
import { PyodideEnvironment } from './python/PyodideEnvironment.js';

export type RuntimeEnvironmentFactory = () => ExecutionEnvironment;

export class RuntimeManager {
  private active: ExecutionEnvironment | undefined;
  constructor(
    private readonly factories: Partial<Record<RuntimeProvider, RuntimeEnvironmentFactory>> = {
      pyodide: () => new PyodideEnvironment(),
    },
  ) {}

  async select(config: RuntimeConfig): Promise<ExecutionEnvironment | undefined> {
    if (config.provider === 'webcontainer' && !this.factories.webcontainer) {
      await this.dispose();
      return undefined;
    }

    if (this.active?.provider === config.provider) {
      await this.active.initialize(config);
      return this.active;
    }

    await this.dispose();

    const factory = this.factories[config.provider];

    if (!factory) {
      throw new Error(`No execution environment registered for ${config.provider}.`);
    }

    this.active = factory();
    await this.active.initialize(config);

    return this.active;
  }

  async dispose(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    await active?.dispose();
  }
}
