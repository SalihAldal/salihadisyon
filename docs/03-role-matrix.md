# 03 Role Matrix

| Rol | Kapsam | Ana Yetkiler |
| --- | --- | --- |
| `super_admin` | Tum tenantlar | abonelik, plan, tenant acma, tum raporlar |
| `tenant_owner` | Kendi sirketi | tum subeler, finans, rapor, entegrasyon, personel |
| `branch_manager` | Belirli subeler | gunluk operasyon, menu, kampanya, stok, personel |
| `cashier` | POS | adisyon acma, odeme alma, musteri secme |
| `waiter` | Salon | masa, adisyon, not, tasima, bolme |
| `kitchen` | Uretim | sadece siparis akisini gorme |
| `accounting` | Finans | muhasebe, KDV, kasa kapanisi, export |
| `hr` | IK | personel, mesai, mola, gorev, hedef |
| `auditor` | Denetim | raporlar, dashboard, audit inceleme |

## Scope Kurallari
- `super_admin` scope disi tum tenantlara erisebilir.
- `tenant_owner` sirket duzeyinde ama yalniz kendi `companyId` uzerinde calisir.
- `branch_manager` ve operasyon rolleri sadece atanmis `branchId` listesi ile sinirlidir.
- Kayit sorgulari her zaman guard + service katmaninda scope zorlamasi uygular.
