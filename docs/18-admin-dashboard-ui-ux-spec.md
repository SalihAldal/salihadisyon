# 18 Admin Dashboard UI UX Spec

## 1. Global Design System

### Tasarim Prensipleri
- Yogun veri + hizli operasyon dengesi korunur.
- Her ekran `header -> filter bar -> stats strip -> content surface -> drawer/modal` sirasini izler.
- Kart, tablo, form ve modal arasinda tek tip spacing kullanilir.
- Ana aksiyon her zaman mor/mavi primary; ikincil aksiyon outline; riskli aksiyon destructive.
- Bilgi yogunlugunu azaltmak icin en fazla 3 vurgu seviyesi kullanilir: `title`, `meta`, `support`.

### Component Families
- Navigation: sidebar, nested menu, breadcrumb, top tabs
- Actions: primary button, outline button, ghost button, split button, dropdown action
- Feedback: badge, toast, inline alert, empty state, loading skeleton, error banner
- Data: stats card, trend chart, data table, summary strip, timeline, activity stream
- Forms: field, section card, sticky action footer, validation summary, right drawer form
- Overlays: detail drawer, create modal, confirm modal, bulk action sheet

## 2. Layout Sistemi

### Grid
- Desktop ana alan 12 kolon grid.
- Sol sidebar sabit `296-320px`.
- Icerik container max `1680px`.
- Yatay bosluk desktop `24px`, section gap `20px`, card padding `24px`.

### Page Anatomy
1. Sticky topbar
2. Page header with breadcrumb + title + action cluster
3. Sticky filter bar
4. Optional KPI row
5. Main content
6. Right detail drawer / modal / toast layer

### Surface Rules
- Sayfa zemini soft gray
- Tum ana paneller beyaz
- Hover state `translateY(-1px)` yerine daha hafif `shadow intensity` artisiyla verilir
- Table, form, chart ve drawer panellerinde ayni radius dili kullanilir

## 3. Sidebar Davranisi

### Sidebar Yapisi
- Ustte tenant switcher, ortada ana menu, altta sistem saglik kutusu
- Parent menuler default olarak acik/kapali state saklar
- Aktif sayfa hem parent hem child seviyesinde vurgulanir
- 8+ alt menu olan parent'larda ic scroll kullanilir

### Interaction
- Hover: arka plan hafif aydinlanir
- Active: accent glow + solda 3px indikator
- Badge: destek, onay bekleyen, kritik uyarilar gibi durumlarda kullanilir
- External link: `Satis Ekranina Git` yeni sekme veya ayrik app olarak acilir

### Mobile
- Off-canvas drawer olarak acilir
- Search ve quick actions topbara tasinir
- Child menuler accordion davranir

## 4. Topbar Davranisi

### Sol Alan
- Workspace switch
- Global search / command bar
- Opsiyonel branch context pill

### Sag Alan
- Export merkezi
- Hizli islem menusu
- Bildirim dropdown
- Kullanici profili / rol / online durumu

### Search Mantigi
- Masa, adisyon, musteri, urun, personel, rapor, stok karti ve cihaz sonuclari ayni kutuda gelir
- Son aramalar ve hizli kisayollar listelenir

## 5. Dashboard Sayfasi

### Amac
Isletme yoneticisine tek bakista gelir, operasyon, personel, stok ve risk gorunumu sunmak.

### Header
- Title: `Operasyon Merkezi`
- Subtitle: aktif tarih araligi ve secili sube ozet bilgisi
- CTA: `Hizli Islem`, `Canli Duruma Gec`, `Filtre Kaydet`

### Breadcrumb
- `Anasayfa / Operasyon Merkezi / Dashboard`

### Filter Bar
- Tarih araligi
- Sube
- Personel
- Saat araligi
- Kategori
- Karsilastirma modu

### KPI Row
- Gunluk ciro
- Haftalik ciro
- Aylik ciro
- Net kar marji
- Ortalama fis
- Masa cevrim suresi

### Dashboard Blocks
- Ciro trend chart + odeme dagilimi donut
- Sube bazli karsilastirma heatmap
- Durum akisi / operasyon uyarilari
- Gunluk yapilacaklar
- Gunluk mesailer
- Yaklasan dogum gunleri
- Kritik stoklar
- Kampanya ozetleri
- Son kasa kapanislari
- Personel performans ozetleri

### State Tasarimi
- Loading: kart skeleton + chart shimmer + list row skeleton
- Empty: `Bugun bu filtrelerle veri bulunamadi`, `Filtreleri sifirla`
- Error: inline alert + retry + log request id
- Mobile: kartlar tek kolon, chartlar accordion panel

## 6. Modul Modul Tum Sayfalar

### Dashboard ve Ciro

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Anasayfa | Amac: tum operasyonu ozetlemek. Header: Operasyon Merkezi. Breadcrumb: Anasayfa / Dashboard. | tarih, sube, personel, saat, kategori | Tablo odagi yok; gorev, stok, uyarilar listeleri. Sag ust: Hizli Islem, Export, Canli Durum. | Detail drawer: uyarilar, kasa kapanisi, kritik stok. Badge: success, warning, danger. Empty: filtreye gore veri yok. Mobile: KPI stack + collapsible blocks. |
| Ciro | Amac: gelir analizi. Header: Ciro ve Finansal Trendler. Breadcrumb: Anasayfa / Ciro. | tarih araligi, sube, kanal, odeme tipi, personel | Kolonlar: tarih, sube, kanal, adet, net, iskonto, vergi, brut. Bulk: export excel/pdf/csv. Top right: yeni karsilastirma, grafik modu, export. | Drawer: gun detay dagilimi. Form: kayit olusturma yok, rapor preset kaydetme var. Badge: artis/azalis. Loading: chart + table skeleton. Mobile: table card view. |

### POS Ayarlari

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Menu Yonetimi | Amac: kategori, alt kategori, urun ve varyant yonetimi. Header: Menu Yonetimi. Breadcrumb: POS Ayarlari / Menu Yonetimi. | sube, kategori, kanal, gorunurluk, stok bagli, arama | kategori/urun agaci + kolonlar: urun, kategori, fiyat, varyant, QR durumu, stok baglantisi, guncelleme. Bulk: aktif/pasif, kanal ata, export. Top right: yeni kategori, yeni urun, siralama modu. | Drawer: urun detay. Form: ad, slug, kategori, aciklama, fiyat, sube fiyatlari, varyantlar, modifier gruplari, zorunlu secim, QR gorunur, satis kanallari, stok baglantisi. Badge: visible, hidden, qr, out-of-stock. Empty: ilk urununu ekle. Mobile: tree yerine segmented tabs. |
| Kampanyalar | Amac: kampanya listesi ve performansi. Header: Kampanyalar. Breadcrumb: POS Ayarlari / Kampanyalar. | sube, tip, otomatik-manuel, aktiflik, tarih, arama | kolonlar: kampanya adi, tip, kapsam, sube, baslangic, bitis, durum, performans. Bulk: aktif/pasif, kopyala, export. Top right: kampanya olustur. | Drawer: kural ve etki ozeti. Form: ad, tip, trigger, fayda, sube, tarih-saat, otomatiklik, celisme kurali. Badge: active, scheduled, expired, conflict. Mobile: stacked cards. |
| Happy Hour | Amac: saat bazli fiyat pencereleri. Header: Happy Hour. Breadcrumb: POS Ayarlari / Happy Hour. | sube, gun, saat, kategori | kolonlar: adi, gunler, saat araligi, urun/kategori, indirim, aktiflik. Bulk: ac/kapat, kopyala. Top right: happy hour tanimla. | Form: gunler, saat, urun/kategori, indirim, sube. Badge: now live, upcoming, ended. Empty: saat bazli kampanya yok. |
| Sureli Indirimler | Amac: tarih planli indirimler. Header: Sureli Indirimler. Breadcrumb: POS Ayarlari / Sureli Indirimler. | sube, tarih, tip, otomatiklik | kolonlar: ad, urun/kategori, indirim tipi, oran, tarih, durum. Bulk: durdur, yayinla. Top right: indirim ekle. | Form: ad, hedef, yuzde/tutar, tarih, saat, sube, kanal. Badge: scheduled, active, archived. |
| QR Menu | Amac: dijital menu yayinlamak. Header: QR Menu. Breadcrumb: POS Ayarlari / QR Menu. | sube, yayin durumu, kategori, tema | kolonlar: sube, yayin linki, tema, dil, son guncelleme, yayin durumu. Bulk: yayinla, gizle. Top right: QR tasarim ayari, yeni yayin. | Drawer: onizleme ve linkler. Form: logo, kapak, kategori gorunumu, fiyat gorunumu, dil, masa bazli link. Badge: live, hidden, needs-review. |
| Bolumler / Masalar | Amac: masa plani ve salon yonetimi. Header: Bolumler ve Masalar. Breadcrumb: POS Ayarlari / Bolumler / Masalar. | sube, salon, durum, kapasite | kolonlar: masa, salon, kapasite, renk, durum, cevrim suresi, aktif adisyon. Bulk: renk degistir, salon ata. Top right: salon ekle, masa ekle, plan modu. | Drawer: masa detay ve son hareketler. Form: salon, masa kodu, isim, kapasite, renk, self servis sirasi. Badge: bos, dolu, rezerve, temizlikte. Mobile: floor cards. |
| Paket Servis Adresleri | Amac: teslimat alanlari ve adres yonetimi. Header: Paket Servis Adresleri. Breadcrumb: POS Ayarlari / Paket Servis Adresleri. | sube, ilce, etiket, aktiflik | kolonlar: musteri, baslik, ilce, teslimat notu, varsayilan, siparis adedi. Bulk: etiketle, sil. Top right: adres ekle. | Drawer: adres detay + siparis gecmisi. Form: musteri, adres basligi, acik adres, konum, not, varsayilan. Badge: default, inactive. |
| Musteriler | Amac: musteri havuzu. Header: Musteriler. Breadcrumb: POS Ayarlari / Musteriler. | sube, segment, dogum gunu, puan, son siparis | kolonlar: ad, telefon, segment, toplam siparis, ortalama sepet, son siparis, puan. Bulk: segment ata, export, sms/whatsapp kampanya listesi. Top right: musteri ekle, iceri aktar. | Drawer: profil, adresler, siparisler, notlar. Form: ad, telefon, email, dogum tarihi, not, etiketler. Badge: VIP, yeni, riskli. |
| Opsiyonel Urunler | Amac: modifier yonetimi. Header: Opsiyonel Urunler. Breadcrumb: POS Ayarlari / Opsiyonel Urunler. | sube, grup, aktiflik | kolonlar: grup, secenek, fiyat farki, sira, aktiflik. Bulk: aktif/pasif, gruba tasi. Top right: grup ekle, opsiyon ekle. | Form: grup adi, min/max secim, secenekler, fiyat farki. Badge: linked, unused. |
| Zorunlu Secim Gruplari | Amac: secim zorunlu urun setleri. Header: Zorunlu Secim Gruplari. Breadcrumb: POS Ayarlari / Zorunlu Secim Gruplari. | sube, grup, bagli urun | kolonlar: grup, min/max, bagli urun sayisi, secenek adedi. Bulk: urune bagla, export. Top right: secim grubu ekle. | Form: grup adi, secenekler, min/max, bagli urunler. Badge: required, optional-mix. |
| Odeme Yontemleri | Amac: odeme tipi ve sira. Header: Odeme Yontemleri. Breadcrumb: POS Ayarlari / Odeme Yontemleri. | sube, tip, aktiflik, entegrasyon | kolonlar: isim, tip, terminal, komisyon, aktiflik, parcali odeme. Bulk: ac/kapat. Top right: odeme yontemi ekle. | Form: ad, tip, entegrasyon, komisyon, terminal eslesmesi, parcali odeme. Badge: active, offline, integrated. |
| Tanimli Cihazlar | Amac: cihaz envanteri. Header: Tanimli Cihazlar. Breadcrumb: POS Ayarlari / Tanimli Cihazlar. | sube, platform, durum | kolonlar: cihaz, tip, platform, kullanıcı, son gorulme, durum. Bulk: devre disi, yeniden esle. Top right: cihaz tanimla. | Drawer: cihaz logu. Form: ad, tip, platform, fingerprint, terminal. Badge: online, offline, locked. |
| Terminaller | Amac: terminal sagligi. Header: Terminaller. Breadcrumb: POS Ayarlari / Terminaller. | sube, heartbeat, yazici, durum | kolonlar: terminal, IP, heartbeat, yazici, vardiya, durum. Bulk: restart talebi, export. Top right: terminal ekle. | Form: kod, ad, IP, bagli yazici, izinli odeme tipleri. Badge: healthy, stale, offline. |
| Yazicilar | Amac: fis ve mutfak yazici yonetimi. Header: Yazicilar. Breadcrumb: POS Ayarlari / Yazicilar. | sube, tip, mutfak, baglanti | kolonlar: ad, tip, baglanti, mutfak, son test, durum. Bulk: test yazdir, devre disi birak. Top right: yazici ekle. | Form: ad, tip, URI, mutfak hedefleri, fis senaryosu. Badge: kitchen, cashier, error. |
| Arka Ekran Slider | Amac: POS arka ekran kreatifleri. Header: Arka Ekran Slider. Breadcrumb: POS Ayarlari / Arka Ekran Slider. | sube, yayin durumu, tarih | kolonlar: baslik, gorsel, CTA, yayin araligi, aktiflik. Bulk: yayinla, sira degistir. Top right: slider ekle. | Form: gorsel, baslik, alt metin, CTA, link, siralama, tarih. Badge: live, draft. |
| Masa Renkleri | Amac: durum renk sistemi. Header: Masa Renkleri. Breadcrumb: POS Ayarlari / Masa Renkleri. | sube, durum | kolonlar: durum, hex, kullanim alani, son guncelleme. Bulk: sifirla. Top right: renk seti olustur. | Form: durum, renk, ikon, kontrast notu. Badge: accessible, custom. |
| Indirim Turleri | Amac: indirim setleri. Header: Indirim Turleri. Breadcrumb: POS Ayarlari / Indirim Turleri. | sube, tip, limit, aktiflik | kolonlar: isim, tip, oran, limit, onay gerekli, aktiflik. Bulk: aktif/pasif. Top right: indirim tipi ekle. | Form: isim, yuzde/tutar, max limit, rol bazli izin, onay gerekir. Badge: approval-required, active. |
| On Tanimli Notlar | Amac: hizli not setleri. Header: On Tanimli Notlar. Breadcrumb: POS Ayarlari / On Tanimli Notlar. | sube, kategori, aktiflik | kolonlar: not, kategori, kanal, sira, aktiflik. Bulk: sira degistir, sil. Top right: not ekle. | Form: not metni, kategori, kanal, sira. Badge: kitchen, customer-facing. |
| Ayarlar | Amac: genel POS davranisi. Header: POS Ayarlari. Breadcrumb: POS Ayarlari / Ayarlar. | sube, ayar grubu | Tablo yerine ayar section kartlari. Top right: kaydet, varsayilana don. | Form section'lari: adisyon davranisi, odeme, fis, offline fallback, kampanya celismesi, QR. States: unsaved changes toast. Mobile: accordion settings. |

### Personel Yonetimi

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Yonetici & Personel | personel kayit ve rol yonetimi. Header: Yonetici ve Personel. Breadcrumb: Personel / Yonetici ve Personel. | sube, rol, departman, aktiflik, arama | ad, kod, rol, departman, vardiya, son giris, durum. Bulk: rol ata, davet gonder, pasiflestir. Top right: personel ekle, yonetici ekle. | Form: kimlik, iletisim, sube, rol, maas, ise giris, cihaz, izin. Badge: active, invited, suspended. |
| Hedefler | personel ve sube hedefleri. Header: Hedefler. Breadcrumb: Personel / Hedefler. | sube, hedef tipi, donem, sahip | baslik, sahip, hedef deger, gerceklesen, oran, bitis tarihi. Bulk: kopyala, arsivle. Top right: hedef olustur. | Form: baslik, hedef tipi, sahibi, hedef deger, donem, KPI metric. Badge: on-track, risk, achieved. |
| Personel Bildirimleri | ic iletisim. Header: Personel Bildirimleri. Breadcrumb: Personel / Personel Bildirimleri. | sube, kanal, okunma, oncelik | baslik, hedef grup, gonderim, okunma orani, oncelik, durum. Bulk: tekrar gonder, arsivle. Top right: bildirim gonder. | Form: baslik, mesaj, hedef rol, sube, push/in-app, zamanlama. Badge: sent, scheduled, draft. |
| Mesai Yonetimi | vardiya planlari. Header: Mesai Yonetimi. Breadcrumb: Personel / Mesai Yonetimi. | sube, tarih, departman, onay | personel, planlanan giris, planlanan cikis, gerceklesen, fark, onay. Bulk: toplu onay, vardiya ata. Top right: vardiya olustur. | Drawer: vardiya timeline. Form: personel, gun, saat, mola politikasi, not. Badge: late, approved, overtime. |
| Mola Sureleri | mola kullanimi. Header: Mola Sureleri. Breadcrumb: Personel / Mola Sureleri. | sube, tarih, mola tipi, personel | personel, vardiya, mola baslangic, bitis, toplam dakika, kural uyumu. Bulk: onayla, duzelt. Top right: manuel mola kaydi. | Form: personel, vardiya, mola tipi, baslangic, bitis. Badge: active-break, exceeded, approved. |
| Personel Takip | canli durum takibi. Header: Personel Takip. Breadcrumb: Personel / Personel Takip. | sube, durum, rol, saat | personel, rol, anlik durum, son hareket, cihaz, konum/kiosk. Bulk: bildirim gonder. Top right: canli ekran, export. | Drawer: bugun hareketleri, mola ve mesai logu. Badge: on-shift, break, off-shift, late. |
| Personel Rolleri | rol ve yetki. Header: Personel Rolleri. Breadcrumb: Personel / Personel Rolleri. | sube, sistem/custom, modül | rol, kapsama, kullanici sayisi, kritik izin, son guncelleme. Bulk: klonla, sil. Top right: rol olustur. | Form: rol adi, kapsam, izin matrisi, sube limiti. Badge: system, custom, restricted. |
| Gorevler | gorev akislari. Header: Gorevler. Breadcrumb: Personel / Gorevler. | sube, sahip, durum, son tarih | gorev, sahip, oncelik, son tarih, durum, checklist. Bulk: ata, tamamlandi yap, arsivle. Top right: gorev ekle. | Form: baslik, aciklama, sahip, son tarih, checklist, bildirim. Badge: todo, in-progress, overdue, done. |
| Operasyon Denetim Sorulari | denetim soru havuzu. Header: Operasyon Denetim Sorulari. Breadcrumb: Personel / Operasyon Denetim Sorulari. | sube, kategori, aktiflik | soru, kategori, puan, zorunlu, aktiflik. Bulk: kategori ata, pasiflestir. Top right: soru ekle. | Form: soru, kategori, puan, kanit gerekli, zorunlu. Badge: required, evidence-needed. |
| Operasyon Denetim Anketi | denetim formlari. Header: Operasyon Denetim Anketi. Breadcrumb: Personel / Operasyon Denetim Anketi. | sube, anket, durum, tarih | anket, hedef sube, soru sayisi, skor, durum, tamamlanma. Bulk: yayinla, kopyala. Top right: anket olustur. | Form: anket adi, soru secimi, puanlama, zorunlu medya, hedef sube, tarih. Badge: draft, active, completed. |

### Mesai / Mola QR

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Mesai / Mola QR | QR token uretmek, okutma loglarini izlemek. Header: Mesai / Mola QR. Breadcrumb: Personel / Mesai QR. | sube, action tipi, expiry, personel, tarih | token, action, sube, expiry, son okutma, durum. Bulk: yenile, iptal et, export. Top right: QR olustur, kiosk moda gec. | Drawer: signed payload, okutma logu. Form: sube, action, expiry, tekil/ortak token, onay akisi. Badge: active, expired, revoked, suspicious. Mobile: full-screen QR cards. |

### Muhasebe Kayitlari

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Hesaplar | hesap plani yonetimi. Header: Hesaplar. Breadcrumb: Muhasebe / Hesaplar. | sube, tip, aktiflik | kod, hesap adi, tip, bakiye, bagli hareket sayisi. Bulk: export, pasiflestir. Top right: hesap ekle. | Form: kod, ad, tip, parent hesap, aciklama. Badge: active, archived. |
| Adisyon Listesi | finansal adisyon izleme. Header: Adisyon Listesi. Breadcrumb: Muhasebe / Adisyon Listesi. | sube, tarih, kanal, odeme, durum | fis no, masa/kanal, musteri, net tutar, vergi, odeme durumu, kapanis saati. Bulk: export, mutabakat. Top right: detayli export. | Drawer: adisyon + odeme dagilimi. Badge: paid, pending, refunded, void. |
| Satilan Urunler | urun bazli satis muhasebesi. Header: Satilan Urunler. Breadcrumb: Muhasebe / Satilan Urunler. | sube, tarih, kategori, urun, KDV | urun, adet, net, vergi, brut, maliyet, kar. Bulk: export. Top right: urun karlilik gor. | Drawer: urun satis trendi. |
| Odemeler | tahsilat kayitlari. Header: Odemeler. Breadcrumb: Muhasebe / Odemeler. | sube, odeme tipi, tarih, terminal | referans, adisyon, tip, tutar, terminal, saat, durum. Bulk: export, mutabakat isaretle. Top right: manuel odeme ekle. | Form: kaynak, odeme tipi, tutar, not. Badge: completed, failed, refunded. |
| Urun KDV Oranlari | KDV yonetimi. Header: Urun KDV Oranlari. Breadcrumb: Muhasebe / Urun KDV Oranlari. | sube, oran, kategori | urun/kategori, KDV orani, etkili tarih, guncelleyen. Bulk: toplu guncelle. Top right: oran ekle. | Form: hedef, oran, etkili tarih. Badge: reduced, standard. |
| Tedarikciler | tedarikci listesi. Header: Tedarikciler. Breadcrumb: Muhasebe / Tedarikciler. | durum, vergi no, kategori | tedarikci, vergi no, telefon, fatura adedi, borc/alacak, durum. Bulk: export, etiketle. Top right: tedarikci ekle. | Drawer: iletisim + fatura gecmisi. Form: unvan, vergi no, iletisim, banka, not. |
| Tedarikci KDV Raporlari | alis KDV raporu. Header: Tedarikci KDV Raporlari. Breadcrumb: Muhasebe / Tedarikci KDV Raporlari. | tedarikci, donem, sube | tedarikci, donem, matrah, KDV, toplam, belge sayisi. Bulk: export. Top right: rapor olustur. | Drawer: donem detaylari. |
| Musteri Isletmeler | kurumsal musteriler. Header: Musteri Isletmeler. Breadcrumb: Muhasebe / Musteri Isletmeler. | sektor, sube, aktiflik | unvan, vergi no, yetkili, odeme vadesi, ciro. Bulk: export, segmentle. Top right: musteri isletme ekle. | Form: unvan, vergi no, adres, yetkili, vade, not. |
| Musteri KDV Raporlari | satis KDV raporu. Header: Musteri KDV Raporlari. Breadcrumb: Muhasebe / Musteri KDV Raporlari. | musteri, donem, sube | musteri, donem, matrah, KDV, belge adedi. Bulk: export. Top right: rapor olustur. | Drawer: belge listesi. |
| Faturalar | fatura listesi. Header: Faturalar. Breadcrumb: Muhasebe / Faturalar. | sube, tip, tarih, tedarikci/musteri, durum | fatura no, taraf, tarih, matrah, KDV, toplam, durum. Bulk: export, arsivle. Top right: fatura ekle, e-fatura hazirla. | Drawer: belge onizleme. Form: taraf, no, tarih, kalemler, vergi, toplam. Badge: draft, issued, cancelled. |
| Fatura Kalemleri | kalem bazli analiz. Header: Fatura Kalemleri. Breadcrumb: Muhasebe / Fatura Kalemleri. | donem, urun/hizmet, KDV | aciklama, miktar, birim fiyat, KDV, satir toplam, fatura no. Bulk: export. Top right: kalem icgoru. | Drawer: bagli fatura. |
| Birim Maliyetler | urun maliyet trendi. Header: Birim Maliyetler. Breadcrumb: Muhasebe / Birim Maliyetler. | urun, tedarikci, tarih, sube | urun, maliyet, etkili tarih, onceki maliyet, degisim, kaynak. Bulk: toplu guncelle, export. Top right: maliyet ekle. | Form: urun, maliyet, tarih, kaynak. Badge: increased, decreased, stable. |
| Kasa Kapanislari | kasa gun sonu. Header: Kasa Kapanislari. Breadcrumb: Muhasebe / Kasa Kapanislari. | sube, terminal, tarih, fark | sube, terminal, beklenen, sayilan, fark, onaylayan, durum. Bulk: onayla, export. Top right: kasa kapat. | Drawer: odeme dagilimi + fark sebebi. Form: terminal, sayilan tutar, not, onay. Badge: balanced, variance, pending. |
| Sabit Maliyetler | recurrent giderler. Header: Sabit Maliyetler. Breadcrumb: Muhasebe / Sabit Maliyetler. | kategori, donem, sube | gider, kategori, tutar, odeme tarihi, tekrar sikligi, durum. Bulk: export, toplu tarih guncelle. Top right: maliyet ekle. | Form: baslik, kategori, tutar, tekrar, odeme gunu, not. |
| Personel Odemeleri | bordro ve odeme. Header: Personel Odemeleri. Breadcrumb: Muhasebe / Personel Odemeleri. | sube, personel, donem, durum | personel, donem, brut, kesinti, net, odeme tarihi, durum. Bulk: export, onayla. Top right: odeme kaydi ekle. | Form: personel, donem, tutar, not, banka. Badge: paid, pending. |
| Diger Odemeler | misc payment. Header: Diger Odemeler. Breadcrumb: Muhasebe / Diger Odemeler. | kategori, tarih, sube | baslik, kategori, tutar, tarih, odeme kanali, not. Bulk: export. Top right: odeme ekle. | Form: baslik, kategori, tutar, tarih, kanal, aciklama. |

### Stok

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Depolar | depo bazli stok. Header: Depolar. Breadcrumb: Stok / Depolar. | sube, aktiflik | depo, kod, sorumlu, urun sayisi, toplam stok degeri. Bulk: export, pasiflestir. Top right: depo ekle. | Form: ad, kod, sorumlu, aciklama. |
| Depo Transfer | depolar arasi transfer. Header: Depo Transfer. Breadcrumb: Stok / Depo Transfer. | sube, durum, tarih, cikis depo | transfer no, cikis, varis, tarih, kalem sayisi, durum. Bulk: onayla, iptal et. Top right: transfer baslat. | Drawer: transfer kalemleri. Form: cikis depo, varis depo, kalemler, not. Badge: pending, in-transit, completed, cancelled. |
| Stok Birimleri | birim sozlugu. Header: Stok Birimleri. Breadcrumb: Stok / Stok Birimleri. | aktiflik | ad, sembol, bagli urun sayisi. Bulk: sil, birlestir. Top right: birim ekle. | Form: ad, sembol, ondalik hassasiyet. |
| Stoklu Urun Kategorileri | stok kategori yapisi. Header: Stoklu Urun Kategorileri. Breadcrumb: Stok / Stoklu Urun Kategorileri. | depo, parent kategori | kategori, parent, urun sayisi, aktiflik. Bulk: tasi, sil. Top right: kategori ekle. | Form: ad, parent, aciklama. |
| Stoklu Urunler | ana stok kartlari. Header: Stoklu Urunler. Breadcrumb: Stok / Stoklu Urunler. | depo, kategori, min seviye, kritik, arama | urun, SKU, depo, birim, mevcut stok, min stok, son giris, durum. Bulk: min stok guncelle, export. Top right: stok urunu ekle. | Drawer: stok karti, hareketler, recete baglari. Form: ad, SKU, depo, kategori, birim, min stok, recete baglantisi. Badge: healthy, low, critical, out. |
| Stok Girisi | stok giris hareketleri. Header: Stok Girisi. Breadcrumb: Stok / Stok Girisi. | depo, tarih, tedarikci, kaynak | belge no, urun, miktar, maliyet, depo, tarih, kaynak. Bulk: export. Top right: stok girisi yap. | Form: depo, urun, miktar, maliyet, kaynak, fatura baglantisi. |
| Stok Durumu | anlik durum dashboardu. Header: Stok Durumu. Breadcrumb: Stok / Stok Durumu. | sube, depo, kategori, kritik | urun, mevcut, ayrilan, kullanilan, min, tahmini bitis. Bulk: export, satin alma listesi. Top right: stok alarmi ac. | Empty: stok verisi yok. Mobile: critical cards. |
| Stok Kartlari | hareket bazli ledger. Header: Stok Kartlari. Breadcrumb: Stok / Stok Kartlari. | urun, depo, tarih, hareket tipi | tarih, hareket, belge, giris, cikis, bakiye, kullanici. Bulk: export. Top right: kart gorunumu degistir. | Drawer: urun ayrintisi. |
| Atik Urunler | waste tracking. Header: Atik Urunler. Breadcrumb: Stok / Atik Urunler. | sube, depo, tarih, neden | urun, miktar, neden, tarih, kaydeden, maliyet etkisi. Bulk: export, onaya gonder. Top right: atik kaydi ekle. | Form: urun, miktar, neden, foto kaniti, not. Badge: pending-review, approved. |

### Raporlar

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| Satis Raporlari | satis performansi. Header: Satis Raporlari. Breadcrumb: Raporlar / Satis Raporlari. | tarih, sube, kanal, odeme tipi, masa tipi | saat/gun/sube, siparis, ciro, ort fis, iptal, indirim. Bulk: export, preset kaydet. Top right: ozel rapor. | Drawer: drilldown. |
| Urun Raporlari | urun basarisi. Header: Urun Raporlari. Breadcrumb: Raporlar / Urun Raporlari. | tarih, kategori, sube, kampanya | urun, adet, ciro, marj, iade, populer saat. Bulk: export. Top right: kar marji modu. | Badge: best seller, low performer. |
| Stok Raporlari | stok tuketim ve devir. Header: Stok Raporlari. Breadcrumb: Raporlar / Stok Raporlari. | depo, kategori, tarih, kritik | urun, giris, cikis, atik, net tuketim, kapanis stok. Bulk: export. Top right: recete verim raporu. | Empty: donemde stok hareketi yok. |
| Finans Raporlari | gelir-gider ve KDV. Header: Finans Raporlari. Breadcrumb: Raporlar / Finans Raporlari. | tarih, sube, hesap tipi, vergi | donem, gelir, gider, KDV, net, closure farki. Bulk: export. Top right: P&L, KDV pdf. | Badge: positive, negative. |
| Calisan Raporlari | personel KPI. Header: Calisan Raporlari. Breadcrumb: Raporlar / Calisan Raporlari. | sube, rol, tarih, vardiya | personel, vardiya sayisi, gecikme, satis katkisi, mola, hedef tamamlama. Bulk: export. Top right: performans karti. | Badge: top, risk, stable. |

### Entegrasyonlar, Abonelik ve Diger Tekli Sayfalar

| Sayfa | Amac / Header / Breadcrumb | Filtreler | Tablo Kolonlari / Toplu Aksiyon / Sag Ust | Drawer Modal Form / Badge / State / Mobile |
| --- | --- | --- | --- | --- |
| POS Cihazlari | entegrasyon provider ve cihaz durumu. Header: POS Cihazlari. Breadcrumb: Entegrasyonlar / POS Cihazlari. | sube, provider, durum, heartbeat | cihaz, provider, terminal, son heartbeat, surum, durum. Bulk: reconnect, export. Top right: provider bagla. | Form: provider, credential, terminal esleme, callback. Badge: connected, stale, failed. |
| Abonelik | paket, limit, faturalama. Header: Abonelik ve Kullanim. Breadcrumb: Ayarlar / Abonelik. | donem, durum | Tablo: plan, branch limiti, user limiti, kullanim, yenileme tarihi, durum. Bulk yok. Top right: paket degistir, odeme yontemi. | Drawer: gecmis faturalar. Form: plan, kart, firma bilgisi. Badge: trial, active, passive, suspended. |
| Urun Puanlari | urun rating ve yorum. Header: Urun Puanlari. Breadcrumb: Musteri Deneyimi / Urun Puanlari. | sube, puan, urun, tarih | urun, puan, yorum, kanal, tarih, aksiyon. Bulk: yayinla/gizle. Top right: moderasyon ayari. | Drawer: yorum ve urun satis baglantisi. Badge: published, hidden, flagged. |
| Personel Indirimleri | personel bazli indirim yetkisi. Header: Personel Indirimleri. Breadcrumb: Personel / Personel Indirimleri. | sube, rol, aktiflik | personel/rol, indirim limiti, onay gereksinimi, kullanim adedi. Bulk: limit guncelle. Top right: indirim yetkisi ver. | Form: personel veya rol, max yuzde, max tutar, onay gerektir, gecerlilik. Badge: limited, unrestricted, expired. |
| Destek | destek talepleri ve SLA. Header: Destek. Breadcrumb: Sistem / Destek. | durum, oncelik, kategori, sube | talep no, baslik, kategori, olusturan, SLA, durum, son cevap. Bulk: etiketle, devret. Top right: destek talebi olustur. | Drawer: mesajlasma thread. Form: baslik, kategori, oncelik, aciklama, dosya. Badge: open, waiting, solved, escalated. |
| Satis Ekranina Git | adminden POS uygulamasina hizli gecis. Header: Satis Ekranina Git. Breadcrumb: Hizli Eylem / POS. | sube, terminal | Tablo yok; terminal secim kartlari. Top right: son kullanilan terminale gec. | Empty: aktif terminal yok. Mobile: full width action cards. |

## 7. Tablo Component Standardi

### Toolbar
- Sol: search + quick filters + saved view
- Sag: column visibility, density, export, bulk actions

### Table Rules
- Sticky header
- Row hover with soft background
- First column primary entity
- Last column quick actions
- Empty row yerine tam bos durum komponenti

### Row Action Pattern
- Gozat
- Duzenle
- Detay drawer ac
- Arsivle / pasiflestir
- Audit log gor

### Bulk Actions
- export
- toplu aktif/pasif
- etiket ekle
- kategori/rol/sube ata
- silme yerine `arsivle`

## 8. Form Component Standardi

### Form Layout
- 2 kolon desktop, 1 kolon tablet/mobile
- Uzun formlarda section card mantigi
- Sticky footer: `Iptal`, `Taslak Kaydet`, `Kaydet`

### Field Types
- input
- masked input
- search select
- multi select chips
- date / time range
- sortable repeater
- image upload
- price input
- textarea
- toggle group

### Validation
- Inline field error
- Form ustunde summary alert
- Destructive alanlarda ikinci onay

## 9. Modal Drawer Pattern

### Right Drawer
- Liste ekranlarinda detay, hizli duzenleme, audit log, son hareketler icin
- Genislik `480-560px`
- Sticky header + sticky footer

### Modal
- Kisa create flows ve kritik onaylar icin
- Boyutlar: sm, md, lg
- Multi-step gerekirse stepper

### Confirm Modal
- Refund, delete, void, role change, kasa fark onayi gibi durumlarda
- Her zaman consequence text + audit reason alanı

## 10. Responsive Kurallari

### Desktop
- Sidebar sabit
- Table full width
- Drawer sagdan acilir

### Tablet
- Sidebar collapse
- Filter bar wrap olur
- KPI kartlari 2 kolon

### Mobile
- Sidebar off-canvas
- Table yerine cards veya accordions
- Topbar action'lari dropdown'a iner
- Drawer tam ekran sheet olur
- Sticky CTA footer korunur

## 11. Dark Light Mode Opsiyonu

### Light Mode
- Default operasyon modu
- Yuksek okunabilirlik ve uzun sure kullanim icin optimize

### Dark Mode
- Gece vardiyasi ve dusuk isik kosullari icin opsiyonel
- Sidebar zaten dark oldugu icin gecis yumusak olur
- Data chart ve table contrast testli olmalidir

### Theme Strategy
- Token bazli renk sistemi
- Componentlerde hardcoded renk yerine semantic token
- Badge ve alert tonlari her iki modda ayni anlami korur

## 12. Tasarim Tokenlari

### Colors
- `bg.canvas = #EEF2F7`
- `bg.surface = #FFFFFF`
- `bg.surfaceMuted = #F8FAFC`
- `bg.sidebar = #0F172A`
- `text.primary = #0F172A`
- `text.secondary = #475569`
- `text.muted = #94A3B8`
- `accent.primary = #5B6CFF`
- `accent.secondary = #3B82F6`
- `state.success = #16A34A`
- `state.warning = #D97706`
- `state.danger = #DC2626`

### Radius
- `radius.card = 28`
- `radius.panel = 22`
- `radius.control = 16`
- `radius.badge = 999`

### Shadows
- `shadow.card = 0 14px 38px rgba(15,23,42,0.08)`
- `shadow.elevated = 0 24px 60px rgba(15,23,42,0.12)`

### Spacing
- `space.page = 24`
- `space.section = 20`
- `space.card = 24`
- `space.compact = 12`

### Typography
- display: 34/1.08/700
- heading: 20/1.3/600
- body: 14/1.6/500
- caption: 12/1.4/500

## 13. Ornek Sayfa Wireframe Aciklamalari

### Wireframe 1: Dashboard
- Sol sidebar 320px
- Ustte sticky topbar
- Altinda breadcrumb + title + action row
- Sonraki satir sticky filter chips
- 4 KPI karti ayni satir
- Sol buyuk chart, sag operasyon stream
- Alt satirlarda gorevler, mesailer, dogum gunleri
- Son satirda kritik stok ve kampanya ozeti

### Wireframe 2: Menu Yonetimi
- Header solda title, sagda `Yeni Kategori`, `Yeni Urun`, `Siralama Modu`
- Filter bar: sube, kategori, kanal, visible toggle, search
- Sol panel category tree
- Orta genis alan table
- Sag drawer secili urun detay ve audit log
- Table ustunde bulk action toolbar
- Empty durumda urun gorseli, kisa aciklama ve `Ilk Urunu Ekle`

### Wireframe 3: Kasa Kapanislari
- Header + tarih / sube filtresi
- Ust KPI strip: bekleyen closure, varyansli closure, bugunku toplam nakit
- Ana table
- Satir tiklaninca sag drawer: odeme dagilimi, sayim farki, notlar, audit trail
- Kritik fark varsa sticky warning banner
