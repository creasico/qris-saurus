import { computeCrc } from "../../src/core/crc";

function tag(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function merchantAccount(identifier: string, merchantId: string): string {
  return tag("26", `${tag("00", identifier)}${tag("01", merchantId)}`);
}

function withCrc(body: string): string {
  return `${body}6304${computeCrc(`${body}6304`)}`;
}

export const genericStaticQris = withCrc(
  [
    tag("00", "01"),
    tag("01", "11"),
    merchantAccount("ID.CO.QRIS.WWW", "GENERICSTORE01"),
    tag("52", "5812"),
    tag("53", "360"),
    tag("58", "ID"),
    tag("59", "QRIS SAURUS"),
    tag("60", "JAKARTA"),
  ].join(""),
);

export const shopeepayStaticQris = withCrc(
  [
    tag("00", "01"),
    tag("01", "11"),
    merchantAccount("ID.CO.SHOPEE.WWW", "SPAYSTORE01"),
    tag("52", "5812"),
    tag("53", "360"),
    tag("58", "ID"),
    tag("59", "SHOPEEPAY SHOP"),
    tag("60", "BANDUNG"),
  ].join(""),
);

export const gopayStaticQris = withCrc(
  [
    tag("00", "01"),
    tag("01", "11"),
    merchantAccount("ID.CO.GOPAY.WWW", "GOPAYSTORE01"),
    tag("52", "5812"),
    tag("53", "360"),
    tag("58", "ID"),
    tag("59", "GOPAY SHOP"),
    tag("60", "SURABAYA"),
  ].join(""),
);

export const midtransStaticQris = withCrc(
  [
    tag("00", "01"),
    tag("01", "11"),
    merchantAccount("ID.CO.MIDTRANS.WWW", "MIDTRANS01"),
    tag("52", "5812"),
    tag("53", "360"),
    tag("58", "ID"),
    tag("59", "MIDTRANS SHOP"),
    tag("60", "TANGERANG"),
  ].join(""),
);

export const xenditStaticQris = withCrc(
  [
    tag("00", "01"),
    tag("01", "11"),
    merchantAccount("ID.CO.XENDIT.WWW", "XENDIT0001"),
    tag("52", "5812"),
    tag("53", "360"),
    tag("58", "ID"),
    tag("59", "XENDIT SHOP"),
    tag("60", "DEPOK"),
  ].join(""),
);

export const duitkuStaticQris = withCrc(
  [
    tag("00", "01"),
    tag("01", "11"),
    merchantAccount("ID.CO.DUITKU.WWW", "DUITKUSTORE"),
    tag("52", "5812"),
    tag("53", "360"),
    tag("58", "ID"),
    tag("59", "DUITKU SHOP"),
    tag("60", "BEKASI"),
  ].join(""),
);
