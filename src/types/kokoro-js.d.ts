declare module "kokoro-js" {
  export class KokoroTTS {
    constructor(modelId: string);
    generate(text: string, options?: { voice?: string }): Promise<Float32Array>;
  }
}
