# QRIS Dynamic Notes

## Static vs dynamic

Secara praktis, QRIS statis biasanya memakai point of initiation method `11`, sedangkan QRIS dinamis memakai `12`.

Transformasi static ke dynamic pada library ini berfokus pada:

- mengganti tag `01` menjadi `12`
- menambahkan atau memperbarui tag `54` untuk nominal transaksi
- menambahkan additional data pada tag `62` bila diperlukan
- menghitung ulang tag `63` sebagai CRC

## Important tags

- `00`: payload format indicator
- `01`: point of initiation method
- `26`-`51`: merchant account information
- `52`: merchant category code
- `53`: currency
- `54`: amount
- `55`: tip indicator
- `56`: fixed tip amount
- `57`: percentage tip
- `58`: country code
- `59`: merchant name
- `60`: merchant city
- `62`: additional data field template
- `63`: CRC

## Scope of phase 1

Phase pertama tidak memaksa integrasi gateway API. Fokusnya adalah menghasilkan QRIS dinamis yang valid dari payload QRIS statis yang sudah ada.

## Caveat

Tidak semua provider publik mendokumentasikan flow API QRIS dinamis yang sama. Karena itu, `qris-saurus` memisahkan:

- transformasi lokal payload QRIS
- pembuatan QRIS via payment gateway API
