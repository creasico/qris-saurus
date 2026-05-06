import * as QRCode from "qrcode";

export interface RenderQrOptions {
  width?: number;
  margin?: number;
}

export async function renderQrToDataUrl(qrisString: string, options: RenderQrOptions = {}): Promise<string> {
  return QRCode.toDataURL(qrisString, {
    width: options.width ?? 320,
    margin: options.margin ?? 2,
  });
}

export async function renderQrToFile(
  qrisString: string,
  outputPath: string,
  options: RenderQrOptions = {},
): Promise<void> {
  await QRCode.toFile(outputPath, qrisString, {
    width: options.width ?? 320,
    margin: options.margin ?? 2,
  });
}
