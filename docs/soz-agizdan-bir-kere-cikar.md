# Consequences

Foundry Virtual Tabletop V13 ve D&D5e 5.x için, masa kuralı ihlallerini ve bunların kalıcı Kesinti Cezası yüklerini yöneten kurulabilir modül.

Her ihlal Actor'a anında **+3 Dezavantaj Yükü** ekler. Geri alma talebi varsa oturumdaki ihlal sayısına göre 1d100, en yükseği kullanılan 2d100/3d100 veya dördüncü ihlalden itibaren otomatik 100 uygulanır. D100 ek yükleri ve `−1d4` yükleri temel cezanın üzerine eklenir.

## Gereksinimler

- Foundry Virtual Tabletop V13
- D&D5e 5.x (kaynak doğrulaması ve geliştirme hedefi: 5.3.3)
- Harici modül gerektirmez

Socketlib, libWrapper, Midi-QOL veya jQuery bağımlılığı yoktur. Başka bir oyun sisteminde ya da D&D5e 5.x dışında etkinleştirilirse modül uyarı gösterir ve roll otomasyonunu başlatmaz.

## Kurulum

Manuel kurulum için bu klasörün tamamını Foundry User Data altında şu konuma kopyalayın:

```text
Data/modules/soz-agizdan-bir-kere-cikar/
```

Klasörün kökünde `module.json` bulunmalı ve klasör adı Module ID ile birebir aynı olmalıdır. Foundry'yi yeniden başlatın, ardından:

```text
World → Manage Modules → Consequences
```

modülünü etkinleştirin.

## Kullanım

1. Sol sahne kontrollerinde Token araçları altındaki terazi düğmesinden veya Module Settings içindeki **Kesinti Cezası Yönetimi** girişinden dashboard'u açın.
2. Karakter satırında **+ İhlal** düğmesine basın.
3. İhlal açıklama formu olmadan hemen kaydedilir; +3 temel yük eklenir ve oturum ihlal sayacı artar.
4. Karakter sahibi oyuncu, ihlal chat kartından veya kendi Olay Geçmişi ekranından **Geri Alma d100 Zarını At** düğmesine basar. Zar oyuncunun istemcisinde atılır, aktif GM sonucu doğrulayıp Actor state'ine uygular. Aynı olay ikinci kez çözülemez.
5. Rol sonucunu sahnede uygulayın. Sosyal sonuçlar otomatik ability modifier'a çevrilmez. İşiniz bittiğinde olayı **Çözüldü Olarak İşaretle** ile kapatın.

Modül karakter kâğıdına herhangi bir gösterge veya düğme eklemez. GM yönetimi merkezi dashboard'dan yapar; karakter sahibi oyuncu bekleyen geri alma d100 zarını ihlal chat kartından atar.

### Otomatik ceza tüketimi

Arm/işaretleme kontrolü yoktur. Karakterde yük olduğu sürece her uygun standart D&D5e attack, ability check, skill check, tool check, saving throw, death saving throw ve inisiyatif otomatik olarak Kesinti Cezası alır. Zar başarıyla tamamlanırsa bir yük tüketilir; zar dialog'u iptal edilirse hiçbir yük tüketilmez.

### −1d4

`−1d4`, ayrı bir görsel mesaj olarak taklit edilmez. D&D5e roll config'in `parts`/`data` yapısına `-1d4[SABKC]` gerçek zar terimi olarak eklenir; normal d20 formülünün toplamından düşer. Başarıyla tamamlanan işlemden sonra hem bir Dezavantaj Yükü hem de kullanılmışsa bir `−1d4` yükü düşer. Tüketim chat kartı gerçek d4 sonucunu gösterir.

### Advantage önceliği

D&D5e roll dialog'u tamamlandıktan sonra ilgili D20Roll'un final advantage modu tekrar **DISADVANTAGE** olarak zorlanır. Böylece normal advantage, Help, Inspiration veya benzeri bir kaynak Kesinti Cezası'nı normal roll'a çeviremez. Bir sınama yalnızca iki d20 atar ve yalnızca bir yük tüketir.

### Death Save ve inisiyatif

Death saving throw ve inisiyatif uygun d20 zarlarıdır; disadvantage ve varsa `−1d4` uygulanır, tamamlandıklarında yük tüketilir. Bu davranış her zaman etkindir ve ayrı bir ayarı yoktur.

## Yeni oturum

Dashboard'daki **Yeni Oturum Başlat** yalnızca her karakterin `violationsThisSession` değerini sıfırlar. Kullanılmamış Dezavantaj ve `−1d4` yükleri, olay geçmişi ve açık olaylar korunur.

## Ayarlar

- **Penalty Consumption Chat:** herkese açık, yalnızca GM veya kapalı
- **Violation Result Chat:** herkese açık veya yalnızca GM
- **Actor Başına Geçmiş Sınırı:** varsayılan 100
- **Debug Mode:** lifecycle, hook ve transaction kayıtlarını `[SABKC]` önekiyle konsola yazar

## Macro desteği

Dashboard'u açmak:

```js
game.modules.get("soz-agizdan-bir-kere-cikar").api.openDashboard();
```

Seçili token için doğrudan ihlal eklemek:

```js
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return ui.notifications.warn("Önce bir token seçin.");
await game.modules.get("soz-agizdan-bir-kere-cikar").api.openIncident(actor);
```

Public API ayrıca `addViolation`, `getPenaltyState`, `setPenaltyState`, `resetSessionCounters`, `openHistory` ve `resolveD100` sağlar. İhlal ve sayaç değiştiren metotlar GM izni denetler; `resolveD100` karakter sahibi oyuncu tarafından kullanılır.

## Teknik mimari

Single source of truth Actor üzerindeki şu flag'dir:

```text
flags.soz-agizdan-bir-kere-cikar.state
```

State; kalan iki yük sayısını, oturum ihlal sayısını, bekleyen incident'i, newest-first geçmişi, audit kayıtlarını, schema version ve revision değerini içerir. Her okuma normalize edilir; bozuk veya eski alanlar güvenli varsayılana döner. Aktif GM, native `module.soz-agizdan-bir-kere-cikar` socket kanalı üzerinden roll rezervasyonlarını ve oyuncunun d100 sonucunu yetkili, Actor başına seri biçimde işler.

Doğrulanan D&D5e 5.3.3 zinciri:

- ortak `dnd5e.preRoll(config, dialog, message)`
- ortak `dnd5e.postRollConfiguration(rolls, config, dialog, message)`
- tip hook'ları: `preRollAttack`, `preRollAbilityCheck`, `preRollSavingThrow`, `preRollSkill`, `preRollTool`
- tamamlanma akışları: `rollAttack`, `rollAbilityCheck`, `rollSavingThrow`, `rollSkill`, `rollToolCheck`
- death save zinciri: `deathSave → savingThrow → d20Test → ortak preRoll`

D&D5e pre-roll hook'ları Foundry tarafından senkron çağrılır ve Promise beklemez. Bir oyuncunun roll dialog'u açılmadan önce aktif GM'den yarış-güvenli rezervasyon alabilmek için modül standart, public D&D5e roll giriş metotlarını minimum kapsamda sarar; normal D&D5e pipeline'ı ve chat kartı değiştirilmez. libWrapper mevcutsa `rollAttack`, `rollAbilityCheck`, `rollSavingThrow`, `rollSkill`, `rollToolCheck` ve inisiyatif girişleri libWrapper `WRAPPER` zincirine kaydedilir; bu sayede Midi QOL ve aynı metotları kullanan diğer modüllerle zincirleme korunur. libWrapper yoksa modül zorunlu bağımlılık oluşturmadan doğrudan sarma fallback'ine geçer. Kayıtlar Foundry `shutdown` lifecycle'ında kaldırılır.

## Debug

Module Settings'ten **Debug Mode** açıldığında tarayıcı geliştirici konsolunda şu olaylar görülür:

- hook ve socket kaydı
- roll transaction rezervasyonu
- roll config'e disadvantage / −1d4 uygulanması
- dialog iptalinde transaction serbest bırakılması
- başarılı roll sonunda state güncellemesi ve finalize
- migration ve kontrollü hata ayrıntıları

## Bilinen teknik sınırlamalar

- Foundry bir roll'un anlatı açısından “anlamlı” olup olmadığını bilemez. Arm kontrolü kaldırıldığı için yük varken tüm uygun zarlar otomatik tüketilir; oyuncular gereksiz zar atarak yük tüketmemelidir.
- Standart D&D5e roll metotlarını tamamen atlayıp doğrudan özel Roll nesnesi oluşturan üçüncü taraf otomasyonlar bu modülün transaction hattına girmeyebilir. Standart D&D5e pipeline'ını kullanan modüller hedeflenir.
- libWrapper zorunlu değildir; fakat Midi QOL veya aynı roll girişlerini saran başka modüller kullanılıyorsa uyumlu zincirleme için libWrapper'ın etkin kalması önerilir.
- Aktif GM varken tüm rezervasyon ve tüketimler GM tarafında serileştirilir. Aktif GM yoksa yalnızca Actor sahibi istemcide yerel fallback çalışır; bir Actor'ın birden çok ayrı istemciden tam aynı anda ve GM olmadan roll edilmesi merkezi olarak koordine edilemez.
- NPC güveni, konuşma kısıtları ve tanıkların tutumu anlatısal sonuçlardır; modül bunları otomatik ActiveEffect veya ability modifier'a dönüştürmez.

## Test

Build adımı ve npm bağımlılığı yoktur. Node'un yerleşik test runner'ı ile:

```text
npm test
```

komutu d100 tablo bütünlüğünü, d4 dağılımını, tekrar eden ihlalleri, toplam ceza invariant'larını, sürekli etkin tüketimi, death-save kapsamını, yarış rezervasyonunu ve advantage override seçeneklerini doğrular.

## Lisans

MIT. Ayrıntı için `LICENSE` dosyasına bakın.
