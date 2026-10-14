# Değişiklik Günlüğü

## 1.2.4 — 2026-10-13

- Foundry uyumluluğundaki `maximum: 13` sınırı kaldırıldı; Foundry v14'e geçildiğinde modül otomatik devre dışı kalmaz. Doğrulanan sürüm 13.351.

## 1.2.3 — 2026-08-29

- Karakter kâğıdının üst kısmındaki Kesinti göstergesi tamamen kaldırıldı.
- Dashboard, chat kartları ve ceza otomasyonu değişmeden korunur.

## 1.2.2 — 2026-08-27

- libWrapper mevcutken roll metotları doğrudan değiştirilmek yerine libWrapper `WRAPPER` zinciri üzerinden kaydedilir.
- Midi QOL ve Cauldron of Plentiful Resources ile aynı roll giriş noktalarında görülen çakışma uyarıları giderildi.
- libWrapper kurulu değilse bağımsız doğrudan sarma fallback'i korunur.

## 1.2.1 — 2026-08-27

- Modülün kullanıcıya görünen adı **Consequences** olarak kısaltıldı.

## 1.2.0 — 2026-08-27

- Modülün kullanıcıya görünen adı **Words Have Consequences** olarak değiştirildi.
- Mevcut world verilerini korumak için teknik Module ID değişmeden bırakıldı.

## 1.1.2 — 2026-08-27

- İnisiyatif, ayarsız ve sürekli etkin bir Kesinti Cezası zarı olarak kapsama alındı.

## 1.1.1 — 2026-08-27

- İnisiyatif Kesinti Cezası kapsamından kalıcı olarak çıkarıldı.
- İnisiyatif uygunluk ayarı kaldırıldı.

## 1.1.0 — 2026-08-27

- `+ İhlal` işlemi açıklama formu olmadan doğrudan kayıt oluşturur.
- Geri alma d100 zarını karakter sahibi oyuncu atar; aktif GM sonucu doğrulayıp uygular.
- GM Armed ve Roll Consumption Mode kaldırıldı; yükler tüm uygun zarlar için sürekli etkindir.
- Death saving throw artık Kesinti Cezası kapsamındadır.

## 1.0.0 — 2026-08-26

- Foundry VTT V13 ve D&D5e 5.x için ilk tam sürüm.
- Kalıcı Actor flag state'i, migration/normalization ve audit altyapısı.
- İhlal oluşturma, +3 temel ceza, 1/2/3d100 ve otomatik 100 akışı.
- Tam 1–100 rol sonucu tablosu ve bağımsız `−1d4` yükleri.
- Aktif GM yetkili roll rezervasyonu, iptal güvenliği ve çift tüketim engeli.
- Advantage'ı iptal eden gerçek disadvantage ve gerçek roll formülüne `−1d4` ekleme.
- ApplicationV2 dashboard, DialogV2 formları, history, chat kartları ve actor-sheet göstergesi.
- Türkçe birincil, İngilizce fallback localization.
- Node tabanlı saf kural ve roll-politikası testleri.
