# Changelog

## 1.1.1

- Foundry v14 ve D&D5e 6 desteği: Söz Ağızdan Bir Kere Çıkar artık D&D5e 6.x sürümünde de zar otomasyonunu açıyor (önce yalnızca 5.x).
- D&D5e 6 zar parçalarını pre-roll hook'larından sonra kurduğu için -1d4 cezası zara eklenmiyordu; ceza artık kurulmuş zarın terimlerine ekleniyor. Disadvantage ve yük harcama zaten çalışıyordu.

## 1.1.0

- Enhanced Recovery sekmesi yeniden tasarlandı: başlıkta tek cümlelik özet ("+10 HP / tur") ve açma/kapama anahtarı; baskılanma, son yenilenme ve görünür özellik durum çiplerinde.
- Yalnızca seçilen yöntemin alanları görünür (sabit/yüzde için miktar, formül için formül); tetikleyici iki seçenekli anahtar, baskılayan hasar türleri hap biçiminde.
- Az kullanılan ayarlar katlanır "Gelişmiş" bölümünde.
- Değişiklikler kendiliğinden kaydedilir; "Kaydet" düğmesi kaldırıldı. "Şimdi dene" iyileşmeyi savaş dışında bir kez uygular.
- Sekme metinleri Türkçe.

## 1.0.0

- `remove-electrum` 1.0.0, `muhurlu-bogaz-kelepcesi` 1.3.0, `enhanced-recovery` 0.9.2 ve `soz-agizdan-bir-kere-cikar` 1.2.4 tek modülde birleşti; geçmişleri korundu.
- Her kural modül ayarlarından ayrı ayrı açılıp kapatılabilir.
- İlk açılışta eski modüllerin dünya verileri (kelepçe işareti; Recovery ayarı, son iyileşme ve baskılama; Söz'ün karakter durumu ve dört ayarı) bu modüle taşınır.
- Söz'ün soket kanalı, ayarları ve API'si artık `vaelora-house-rules` altında; testleri `tests/consequences/` içinde.
- Kelepçenin "sihirli eşyaları da engelle" ayarı artık `spellLock.blockMagicItems` anahtarında.
- `EnhancedRecovery` makro API'si aynı adla duruyor.
