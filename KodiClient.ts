export interface KodiClient {
  on(): Promise<void>;
  off(): Promise<void>;
  buttonPress(buttonName: string): Promise<void>;
  getStatus(): Promise<any>;
}