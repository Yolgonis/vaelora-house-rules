# Vaelora Ev Kuralları

Foundry VTT 13 ve D&D 5e (5.3.3) için Vaelora masasının ev kuralları tek modülde. Her kural **Ayarlar → Modül Ayarları → Vaelora Ev Kuralları** altından ayrı ayrı açılıp kapatılabilir; değişiklik sayfa yenilenince geçerli olur.

| Kural | Ne yapar | Ayrıntı |
|---|---|---|
| Electrum'u kaldır | Electrum'u para birimleri listesinden kaldırır. | [docs/remove-electrum.md](docs/remove-electrum.md) |
| Mühürlü Boğaz Kelepçesi | Kelepçe olarak işaretlenen eşya takılıyken büyüleri ve büyü gerektiren eylemleri engeller, attunement'ları kaldırır, concentration'ı bitirir; oyuncular çıkaramaz. Eşya sayfasının Details sekmesindeki kutuyla işaretlenir. | [docs/muhurlu-bogaz-kelepcesi.md](docs/muhurlu-bogaz-kelepcesi.md) |
| Enhanced Recovery | Tur başında ya da sonunda GM kontrollü iyileşme (rejenerasyon); seçilen hasar türleri bir sonraki iyileşmeyi engeller. Karakter ve NPC sayfalarındaki GM'e özel Recovery sekmesinden ayarlanır. Makro API'si: `EnhancedRecovery.get/set/list/test/clear`. | [docs/enhanced-recovery.md](docs/enhanced-recovery.md) |
| Söz Ağızdan Bir Kere Çıkar (Consequences) | İhlaller, geri alma d100 tablosu ve kalıcı Kesinti Cezası yükleri (dezavantaj ve −1d4). Token kontrollerindeki GM panelinden yönetilir. API: `game.modules.get("vaelora-house-rules").api`. MIT lisanslı (`scripts/features/consequences/LICENSE`). | [docs/soz-agizdan-bir-kere-cikar.md](docs/soz-agizdan-bir-kere-cikar.md) |

## Eski modüllerden geçiş

Bu modül `remove-electrum`, `muhurlu-bogaz-kelepcesi`, `enhanced-recovery` ve `soz-agizdan-bir-kere-cikar` modüllerinin yerini alır. Dördünün geçmişi bu depoda (`git log --follow`).

1. Eski dört modülü kapatın, bu modülü açın. Aynı anda açık olmasınlar; kurallar iki kez çalışır.
2. GM dünyayı ilk açtığında eski modüllerin kaydettiği veriler (kelepçe işareti, Recovery ayarları, Söz'ün karakter durumları ve ayarları) bu modüle taşınır ve eski kayıtlar silinir.

## Geliştirme

```
npm test
```

`tests/` altındaki testler Node ile Foundry olmadan çalışır (Söz'ün 21 testi ve modülün yaşam döngüsü testi).

## Uyumluluk

- Foundry Virtual Tabletop 13 (13.351 ile doğrulandı)
- dnd5e 5.3.3
- Türkçe ve İngilizce arayüz (Enhanced Recovery sekmesi Türkçe/İngilizce karışık, eski modüldeki gibi).

## Yazar

Yolgonis
