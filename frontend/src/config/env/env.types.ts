export type AppEnvironment = 'development' | 'production';

export type AppEnv = {
  appEnv: AppEnvironment;
  apiUrl: string;
};

export type RawEnv = Record<string, string | undefined>;
