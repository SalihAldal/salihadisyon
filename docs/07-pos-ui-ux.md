# 07 POS UI UX Plan

## Ekran Bolumleri
- Ust bar: sube, terminal, kanal secimi, personel, arama
- Sol/orta alan: kategori sekmeleri, alt kategori sekmeleri, urun kartlari
- Sag panel: canli adisyon ozeti, notlar, kampanyalar, ozet ve odeme

## Etkilesim Kurallari
- Dokunmatik uyumlu buyuk butonlar
- 1-2 tikla urun ekleme
- Modifier popup akisi hizli ve keyboard-free
- Odeme popup'i parcali odemeyi destekler
- Masa tasima, birlestirme, bolme tek akista yonetilir

## Offline Yaklasimi
- Son menu ve masa verisi local cache'te tutulur
- Yazilamayan mutation'lar local queue'ya alinir
- Baglanti donunce sirali replay yapilir

## Realtime
- Masa durumu degisince renk aninda degisir
- Siparis mutfaga dusunce ticket state guncellenir
- Odeme tamamlaninca tum istemcilerde adisyon kapanir
