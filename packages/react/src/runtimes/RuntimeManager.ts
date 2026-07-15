/* eslint-disable @typescript-eslint/naming-convention */
import type { ExecutionEnvironment, RuntimeCapabilities, RuntimeProvider } from '@tutorialkit/runtime';
import type { RuntimeConfig } from '@tutorialkit/types';
import { PyodideEnvironment } from './python/PyodideEnvironment.js';

export type RuntimeEnvironmentFactory = () => ExecutionEnvironment;

const PYODIDE_CAPABILITIES: RuntimeCapabilities = {
  execution: true,
  terminal: false,
  stdin: false,
  packages: false,
  webPreview: false,
  testing: false,
  interrupt: true,
};
const LEGACY_WEBCONTAINER_CAPABILITIES: RuntimeCapabilities = {
  execution: false,
  terminal: true,
  stdin: true,
  packages: true,
  webPreview: true,
  testing: true,
  interrupt: false,
};

export function getRuntimeCapabilities(config: RuntimeConfig): RuntimeCapabilities {
  return config.provider === 'pyodide' ? PYODIDE_CAPABILITIES : LEGACY_WEBCONTAINER_CAPABILITIES;
}

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
