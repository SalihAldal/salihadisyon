# 13 Security Measures

## Kimlik ve Erisim
- Access token kisa omurlu, refresh token rotate edilir.
- Refresh token secure httpOnly cookie veya device-bound storage ile tutulur.
- Opsiyonel 2FA super admin, tenant owner ve finans rolleri icin aktif edilir.
- Her endpoint permission check + tenant scope guard altindadir.

## Veri Guvenligi
- Tüm SQL erisimi Prisma uzerinden gider.
- Hassas entegrasyon credential'lari sifrelenmis saklanir.
- S3 dosyalari signed URL ile eristirilir.
- Audit log geri donulemez sekilde tutulur.

## Operasyonel Guvenlik
- Rate limit, brute-force koruma, request id, IP kaydi
- Kasa kapanisi, refund, indirim override ve rol degisikligi audit zorunlu
- QR attendance token'lari signed payload ve kisa expiry ile uretilir
- Yetkisiz branch erisimi hem guard hem query katmaninda engellenir
