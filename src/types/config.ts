export interface AuthConfig {
  anthropic_api_key?: string;
}

export interface ConfigLibrary {
  repo: string;
  ref: string;
}

export interface ChorenzoConfig {
  libraries: {
    [key: string]: ConfigLibrary;
  };
  auth?: AuthConfig;
}

export interface State {
  last_checked: string;
}

export enum AuthMethod {
  ClaudeCode = 'claude_code',
  AnthropicApi = 'anthropic_api',
  AwsBedrock = 'aws_bedrock',
  GoogleVertex = 'google_vertex',
}
