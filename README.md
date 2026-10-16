# Sky Stack: YouTube Playables oyunu

Tek dokunuşla oynanan bir kule oyunu. Kayan bloğu doğru anda bırakıp kuleyi büyütürsün. Taşan kısım kesilip düşer. Tam üstüne bırakırsan "PERFECT" kombosu yaparsın, 3 ve üstü kombo bloğu yeniden genişletir.

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html` | Tek sayfa. YouTube SDK'sı oyun kodundan **önce** yükleniyor |
| `game.js` | Tüm oyun (canvas, ses, kayıt, reklam) |
| `style.css` | Tam ekran yerleşim |
| `dist/sky-stack.zip` | YouTube'a yüklenecek paket |

Toplam boyut yaklaşık 10 KB. Harici font, resim ya da kütüphane kullanılmıyor.

## Yerelde çalıştırma

```bash
python -m http.server 8123
```

Ardından tarayıcıda `http://localhost:8123` adresini aç. Yerelde SDK hiçbir şey yapmaz (no-op). Bu yüzden ödüllü reklam yerelde simüle edilir ve ödül direkt verilir.

## Karşılanan Playables şartları

- **SDK:** `https://www.youtube.com/game_api/v1`, `game.js`'ten önce yükleniyor.
- **firstFrameReady / gameReady:** İlk kare "Loading…" ekranıyla çiziliyor, sonra `firstFrameReady()` çağrılıyor. Kayıt ve dil yüklenip menü etkileşime hazır olunca `gameReady()` çağrılıyor.
- **Kayıt:** Sadece `loadData` / `saveData` kullanılıyor (localStorage yok). `saveData`, `loadData` bitmeden çağrılmıyor. Kayıt sürümlü bir JSON (`v: 1`) ve 1 KB'ın altında. Oyun bitince ve duraklatılınca kaydediliyor.
- **Skor:** `sendScore` her zaman kayıttaki en iyi skorla gönderiliyor.
- **Ses:** Sadece `isAudioEnabled` / `onAudioEnabledChange` kullanılıyor. Sessize alma butonu yok. Ses ilk dokunuştan önce çalmıyor.
- **Müzik:** Dosya kullanılmıyor, müzik WebAudio ile kodda üretiliyor (Am–F–C–G döngüsü, 100 BPM). Kule yükseldikçe katmanlar ekleniyor: menüde pad ve bas çalıyor, oyunda kick ve arpej ekleniyor, 20. kattan sonra hi-hat geliyor ve arpej bir oktav yükseliyor. Oyun bitince müziğin sesi kısılıyor. Notalar oyun döngüsünden planlandığı için duraklatma ve reklam sırasında müzik de duruyor. Ses efektleri müzikle uyumlu olsun diye aynı gamda (La minör pentatonik).
- **Duraklatma:** `onPause` gelince oyun döngüsü, ses ve girişler duruyor. `onResume` ile devam ediyor. Page Visibility API kullanılmıyor.
- **Dil:** `getLanguage()` ile seçiliyor (EN, TR, ES, PT, DE, FR), `navigator.language` kullanılmıyor. Varsayılan dil İngilizce.
- **Tasarım:** 9:32'den 32:9'a kadar tüm oranlarda çalışıyor. Ekran boyutu değişince oyun sıfırlanmıyor. Yüksek DPI ekranlarda net görünüyor. Dokunmatik, fare ve klavye (Space / Enter / ↓, devam için C) destekleniyor. Esc engellenmiyor (oyun sonunda menüye döner). Çıkış butonu, link, paylaşım çağrısı ve QR kod yok.
- **Gizlilik:** SDK dışında hiçbir dış isteğe çıkılmıyor. Kişisel veri ve giriş ekranı yok. Kod gizlenmemiş (obfuscate edilmemiş).
- **Hata raporlama:** Yakalanmamış hatalar `health.logError()` ile bildiriliyor.

## Para kazanma (monetization)

YouTube Playables'ta **sadece YouTube'un kendi reklamlarına** izin var. Uygulama içi satın alma ve harici reklam ağları **yasak**. Oyunda şu reklamlar var:

1. **Pre-roll:** Oyun yüklenirken YouTube otomatik gösteriyor, kod gerekmiyor.
2. **Ödüllü reklam (`requestRewardedAd('sky-stack-continue')`):** Oyun bitince, skor 3 veya üstündeyse "Continue (watch ad)" butonu çıkıyor. Her oyunda bir kez kullanılabiliyor ve oyuncu kaldığı yerden devam ediyor. Reklamı sadece oyuncu kendisi başlatabiliyor.
3. **Geçiş reklamı (`requestInterstitialAd()`):** Her 3 "Play again" tıklamasında bir, doğal bir molada gösteriliyor. Sıklık `game.js` içindeki `INTERSTITIAL_EVERY` ile ayarlanabiliyor.

Reklam açıkken oyun donduruluyor ve ses kesiliyor.

**Önemli:** Google'ın dokümanına göre Playables gelir paylaşımı şu an **pilot aşamada** ve sadece seçilmiş geliştiricilere açık. Reklamlar da şimdilik sadece bazı bölge ve platformlardaki kullanıcılara gösteriliyor. Kod hazır, ama gelir almak için Developer Portal'da monetization ayarını açman ve programa kabul edilmen gerekiyor.

## YouTube'a yükleme adımları

1. **Test:** [SDK Test Suite](https://developers.google.com/youtube/gaming/playables/certification/sdktestsuite)'i açıp oyunun yerel adresini (`http://localhost:8123`) yükle. firstFrameReady, gameReady, kayıt, ses, duraklatma ve reklam olaylarını orada dene.
2. **CSP testi:** [Test suite rehberine](https://developers.google.com/youtube/gaming/playables/reference/test_suite_guide) göre Chrome DevTools'ta YouTube'un CSP başlığını uygulayıp konsolda hata olmadığını kontrol et.
3. **Başvuru:** Playables geliştirici programına başvur ve Developer Portal'a erişim al ([Başlangıç sayfası](https://developers.google.com/youtube/gaming/playables/reference/getting_started)).
4. **Paket:** Portal'a `dist/sky-stack.zip` dosyasını yükle (kökte `index.html` var).
5. **Meta veri:** Başlık, açıklama, tür (Arcade / Casual) ve farklı oranlarda küçük resimler ekle. Küçük resimlerde ve açıklamada logo veya marka olmamalı. Erişilebilirlik etiketlerini sadece oyunda gerçekten olan özelliklere göre seç.
6. **Monetization:** Portal'da reklamları aç.
7. **İnceleme:** Sertifikasyona gönder.

Kodu değiştirdikten sonra paketi yeniden oluşturmak için:

```bash
python -c "import zipfile;z=zipfile.ZipFile('dist/sky-stack.zip','w',zipfile.ZIP_DEFLATED);[z.write(f) for f in ['index.html','game.js','style.css']];z.close()"
```
