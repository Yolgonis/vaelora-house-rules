# Vaelora Ev Kuralları

Foundry VTT 13 ve D&D 5e (5.3.3) için Vaelora masasının ev kuralları tek modülde. Her kural **Ayarlar → Modül Ayarları → Vaelora Ev Kuralları** altından ayrı ayrı açılıp kapatılabilir; değişiklik sayfa yenilenince geçerli olur.

| Kural | Ne yapar | Ayrıntı |
|---|---|---|
| Electrum'u kaldır | Electrum'u para birimleri listesinden kaldırır. | [docs/remove-electrum.md](docs/remove-electrum.md) |
| Mühürlü Boğaz Kelepçesi | Kelepçe olarak işaretlenen eşya takılıyken büyüleri ve büyü gerektiren eylemleri engeller, attunement'ları kaldırır, concentration'ı bitirir; oyuncular çıkaramaz. Eşya sayfasının Details sekmesindeki kutuyla işaretlenir. | [docs/muhurlu-bogaz-kelepcesi.md](docs/muhurlu-bogaz-kelepcesi.md) |
| Enhanced Recovery | Tur başında ya da sonunda GM kontrollü iyileşme (rejenerasyon); seçilen hasar türleri bir sonraki iyileşmeyi engeller. Karakter ve NPC sayfalarındaki GM'e özel Recovery sekmesinden ayarlanır. Makro API'si: `EnhancedRecovery.get/set/list/test/clear`. | [docs/enhanced-recovery.md](docs/enhanced-recovery.md) |

## Eski modüllerden geçiş

Bu modül `remove-electrum`, `muhurlu-bogaz-kelepcesi` ve `enhanced-recovery` modüllerinin yerini alır. Üçünün geçmişi bu depoda (`git log --follow`).

1. Eski üç modülü kapatın, bu modülü açın. Aynı anda açık olmasınlar; kurallar iki kez çalışır.
2. GM dünyayı ilk açtığında eski modüllerin kaydettiği veriler (kelepçe işareti, Recovery ayarları) bu modüle taşınır ve eski kayıtlar silinir.

## Uyumluluk

- Foundry Virtual Tabletop 13 (13.351 ile doğrulandı)
- dnd5e 5.3.3
- Türkçe ve İngilizce arayüz (Enhanced Recovery sekmesi Türkçe/İngilizce karışık, eski modüldeki gibi).

## Yazar

Yolgonis
