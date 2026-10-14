# Changelog

## 1.0.0

- `remove-electrum` 1.0.0, `muhurlu-bogaz-kelepcesi` 1.3.0, `enhanced-recovery` 0.9.2 ve `soz-agizdan-bir-kere-cikar` 1.2.4 tek modülde birleşti; geçmişleri korundu.
- Her kural modül ayarlarından ayrı ayrı açılıp kapatılabilir.
- İlk açılışta eski modüllerin dünya verileri (kelepçe işareti; Recovery ayarı, son iyileşme ve baskılama; Söz'ün karakter durumu ve dört ayarı) bu modüle taşınır.
- Söz'ün soket kanalı, ayarları ve API'si artık `vaelora-house-rules` altında; testleri `tests/consequences/` içinde.
- Kelepçenin "sihirli eşyaları da engelle" ayarı artık `spellLock.blockMagicItems` anahtarında.
- `EnhancedRecovery` makro API'si aynı adla duruyor.
