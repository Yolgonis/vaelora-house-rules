# Enhanced Recovery

Foundry VTT 13 ve D&D 5e için GM kontrollü otomatik iyileşme (regeneration) sistemi. Troller, vampirler ve benzeri yaratıkların "turunun başında X can puanı kazanır; radiant hasar aldıysa çalışmaz" türü özelliklerini savaşta otomatik işler.

## Özellikler

- Karakter ve NPC sayfalarına yalnızca GM'in gördüğü bir **Recovery** sekmesi (kalp ikonu) ekler.
- İyileşme tur başında veya tur sonunda uygulanır.
- İyileşme miktarı için yedi mod: sabit, CR + CON, seviye + CON, taban + CON, azami canın yüzdesi, eksik canın yüzdesi ve zar formülü (`@cr`, `@level`, `@base`, `@con` kullanılabilir).
- Koşullar: en düşük can, 0 canda çalışma, belirli bir yüzdenin altında çarpanla iyileşme.
- **Baskılama:** Seçilen hasar türlerinden (radiant, fire, acid vb. veya özel türler) hasar alan yaratık bir sonraki iyileşmesini kaybeder. Yalnızca gerçekten uygulanan hasar sayılır; ıskalanan saldırılar, bağışıklık ve hasar önizlemesi baskılamaz.
- İsteğe bağlı: karakter sayfasında oyuncuların görebileceği bir "Enhanced Recovery" özelliği ve iyileşmeyi duyuran chat mesajı.

## Kullanım

1. GM olarak yaratığın sayfasını açın ve **Recovery** sekmesine geçin.
2. Başlıktaki anahtarı açın; yöntemi, miktarı, tetikleyiciyi ve baskılayan hasar türlerini seçin. Değişiklikler kendiliğinden kaydedilir.
3. **Şimdi dene** iyileşmeyi savaş dışında bir kez uygular. Az kullanılan ayarlar (en düşük can, çarpan, 0 canda çalışma, görünür özellik, sohbet mesajı) **Gelişmiş** bölümündedir.

Savaşta iyileşme yalnızca aktif GM'in istemcisinde ve tur ileri giderken çalışır; birden fazla GM bağlıyken veya tur geri alındığında iki kez uygulanmaz.

Makro desteği: `EnhancedRecovery.get(ad)`, `.set(ad, ayar)`, `.list()`, `.test(ad)`, `.clear(ad)`.

## Uyumluluk

- Foundry Virtual Tabletop 13 (13.351 ile doğrulandı)
- dnd5e 5.3.3
- Midi-QOL gerekmez; varsa onunla da çalışır.

## Değişiklikler

### 0.9.2

- End of Turn tetikleyicisi artık çalışıyor (önceden yalnızca tur başı işleniyordu).
- İyileşme yalnızca aktif GM'de ve tur ileri gittiğinde uygulanır. Birden fazla GM bağlıyken veya tur geri alınınca iki kez iyileşme olmaz.
- Baskılayan hasar artık dnd5e'nin kendi hasar akışından okunur; Midi-QOL gerekmez.
- Görünür özellik açıklaması ayarlanan tetikleyiciyi ve hasar türlerini yansıtır.

### 0.9.1

- Recovery sekmesi Inventory/Features içeriğinin altına gömülmüyor; gerçek sekme olarak ekleniyor.

Yazar: Yolgonis
