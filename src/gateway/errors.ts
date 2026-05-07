export class GatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
  }
}

export class ConfigurationError extends GatewayError {
  constructor(message: string) {
    super("CONFIGURATION_ERROR", message);
    this.name = "ConfigurationError";
  }
}

export class ProviderCapabilityError extends GatewayError {
  constructor(message: string) {
    super("PROVIDER_CAPABILITY_ERROR", message);
    this.name = "ProviderCapabilityError";
  }
}
