# dev-loop Kullanım ve Yetenek Envanteri

Bu belge `dev-loop` 0.1.0 deposunun **mevcut kaynak koduna** göre hazırlanmıştır. Amaç yalnızca hedeflenen ürünü anlatmak değil, bugün gerçekten çalışan davranışlarla henüz iskelet/stub durumda olan yüzeyleri ayırmaktır. Gelecekte verilecek geliştirme promptu bu belgeyle karşılaştırılırken “mevcut” ve “hedeflenen” özellikler karıştırılmamalıdır.

## Ürün özeti

`dev-loop`, bir feature isteğini yapay zekâ destekli bir geliştirme döngüsüne dönüştürmek için hazırlanmış TypeScript monoreposudur. Core kütüphanesi; yapılandırma, model/verifier seçimi, kod üretim döngüsü, test ve kalite kontrolleri, SQLite geçmişi, öğrenme/context, bildirimler, planlama, benchmark ve entegrasyon yardımcıları sağlar. CLI bu yeteneklere komut yüzeyi, UI paketi ise Fastify API ve React ekran bileşenleri sağlamayı hedefler.

> Mevcut durum: Core fonksiyonları, CLI üretim adapterları ve web UI üretim bağlantıları uygulanmıştır. Harici model ve entegrasyon yolları yine ilgili servis/credential gerektirir.

## Gereksinimler ve kurulum

- Node.js: paket metadata'sına göre `>=20`
- npm: `>=10`

```bash
npm install
npm run build -- --force
```

Monorepo paketleri:

- `@dev-loop/core`: otomasyon ve domain kütüphanesi
- `@dev-loop/cli`: `dev-loop` komutu
- `@dev-loop/ui`: Fastify API, WebSocket ve React UI bileşenleri

Yerel CLI kullanımı:

```bash
node packages/cli/dist/main.js --help
```

## Projeyi hazırlama

```bash
dev-loop init --project-dir /proje/yolu
dev-loop setup --project-dir /proje/yolu
```

`init`:

- varsayılan `dev-loop.yaml` oluşturur,
- `.dev-loop/` runtime klasörlerini ve başlangıç dosyalarını hazırlar,
- `.gitignore` girdilerini birleştirir,
- VS Code ayarlarını birleştirir.

`setup`, init adımlarına ek olarak planning provider/model ve test komutu cevaplarını config'e kaydeder. Programatik kullanımda soru-cevap adapter'ı enjekte edilebilir; mevcut standart CLI çağrısı varsayılan cevapları kullanır.

## Yapılandırma

Ana dosya `dev-loop.yaml`'dır. Desteklenen ana bölümler:

- `planning`: planlama sağlayıcısı, modeli ve stratejisi
- `coding`: kodlama modeli/sağlayıcısı
- `verifier`: doğrulayıcı türü, model ve davranışlar
- `fallback`: tekrarlar sonrası alternatif yol
- `loop`: retry, süre ve maliyet sınırları
- `test_runner`: test komutu, timeout ve runner davranışı
- `quality_gate`: coverage, vulnerability ve kalite eşikleri
- `mcp`: MCP sunucuları, sandbox ve kalite kontrolleri
- `context`: kod haritası, semantic memory ve context bütçesi
- `learning`: pattern, calibration ve prompt öğrenimi
- `benchmark`: model benchmark ayarları
- `notifications`: kanal ve event ayarları
- `integrations`: GitHub/Jira ve ikincil entegrasyonlar
- `git`: güvenli commit/rollback davranışı
- `agents`: agent ayarları
- `ui`, `voice`, `observability`: ilgili ürün yüzeyleri

Config özellikleri:

- Zod ile doğrulama ve açıklayıcı validation hataları
- varsayılan değerlerle deep merge
- `${ENV_VAR}` interpolasyonu
- `DEV_LOOP_*` ortam değişkeni override'ları
- YAML okuma/yazma ve dot-notation güncelleme
- secret/token/API key redaksiyonu

Komutlar:

```bash
dev-loop config show -p /proje
dev-loop config set planning.primary.model my-model -p /proje
dev-loop config set --path test_runner.command --value "npm test" -p /proje
dev-loop config-check -p /proje
```

## Geliştirme loop'u

```bash
dev-loop run FEATURE001 -p /proje
dev-loop run FEATURE001 -p /proje --dry-run
dev-loop watch FEATURE001 -p /proje
```

Core `runLoop` akışının desteklediği yetenekler:

1. Runtime klasörlerini ve SQLite DB'yi hazırlar.
2. Config'i yükler; coding ve verifier modelini seçer.
3. Loop geçmişi ve başlangıç checkpoint'i oluşturur.
4. Enjekte edilmiş üretim bağımlılıkları bulunduğunda context oluşturur ve kod üretim turn'lerini çalıştırır.
5. Üretilen dosya formatını ayrıştırır ve proje dışına yazmayı engeller.
6. Test runner ve verifier sonucunu işler.
7. Token, maliyet ve süre bütçelerini izler.
8. Retry/fallback akışını ve hata bulgularını yönetir.
9. Turn, MCP skoru, başarı/başarısızlık ve checkpoint verilerini saklar.
10. Başarı hook'ları üzerinden code map, kararlar, docs, öğrenme, calibration, git/PR/ticket, smoke test, fine-tune export, Obsidian ve calendar adımlarını tetikleyebilir.
11. Başarı, bütçe aşımı ve fallback hatası bildirimleri üretebilir.

Önemli ayrım: Varsayılan CLI `run`, engine'i çağırır; ancak gerçek model generation/test/verifier adapter'ları verilmezse akış yalnızca initialize edilmiş bir loop oluşturup `initialized` durumunda tamamlanabilir. `--dry-run` hiçbir loop çalıştırmaz ve planlanan isteği JSON olarak gösterir.

`watch`, proje klasöründeki değişiklikleri izler, 250 ms debounce uygular ve aynı anda ikinci loop başlatmak yerine yeniden çalışma isteğini sıraya alır.

## Model sağlayıcıları ve seçim

Core aşağıdaki adapter/yetenekleri içerir:

- OpenAI
- OpenRouter
- Anthropic
- Google Generative AI
- Ollama
- LM Studio
- model registry ve provider health
- otomatik model seçimi
- maliyet tahmini ve OpenRouter'da ucuz model seçimi
- VRAM kontrolü, model yükleme kilidi ve quantization önerisi
- streaming event normalizasyonu
- hata sınıflandırma, retry/backoff ve provider-specific hata tipleri
- tekrarlanan hatada model değiştirme

Harici/API tabanlı yollar geçerli API anahtarı, çalışan servis ve uygun model adı gerektirir. Birim testleri adapter davranışını mock'larla doğrular; bu taramada canlı sağlayıcılara ücretli istek gönderilmemiştir.

## Verifier, güvenlik ve belirsizlik

Desteklenen verifier yüzeyleri:

- API verifier
- Codex CLI verifier
- Claude CLI / Claude Code CLI verifier
- verifier factory ve normalize edilmiş review sonucu
- diff-aware retry prompt
- unified diff parser ve diff risk analizi
- verifier çıktısı parser'ı
- MCP kullanım skoru
- `[UNCERTAIN]` benzeri belirsizlik etiketlerini içerik, dosya ve klasörde algılama
- prompt injection algılama ve MCP input tarama
- secret scanner ve çıktı redaksiyonu
- proje dışına path traversal koruması

CLI `verify` komutu yapılandırılmış doğrulama testini çalıştırır ve başarısız doğrulamada başarısız exit code üretir.

## Test ve kalite

Core API:

- shell test runner oluşturma ve çalıştırma
- test çıktısından pass/fail/timeout ayrıştırma
- coverage çıktısı ayrıştırma
- vulnerability çıktısı ayrıştırma
- tekil kalite check'i ve birleşik quality gate
- eşik, trend ve notification sonucu üretme

CLI `test` yapılandırılmış test runner'a, `quality` ise lint/typecheck kalite kapısına bağlıdır.

Repo geliştirme komutları:

```bash
npm test
npm run typecheck
npm run lint
npm run build -- --force
npm run test:coverage
```

10 Temmuz 2026 düzeltme sonucu: typecheck, build ve tam test paketi başarılıdır; 130 test dosyasında 619 test geçmiştir.

## Veritabanı ve geçmiş

SQLite/better-sqlite3 tabanlı katman şunları saklamak ve sorgulamak için schema, migration ve query yardımcıları içerir:

- loop geçmişi ve turn'ler
- checkpoint ile ilişkili çalışma bilgileri
- öğrenilmiş hata/başarı pattern'leri ve versiyonları
- model profilleri ve calibration
- MCP kullanım/skor/hata kayıtları
- uncertain kayıtları
- kalite sonuçları ve trendleri
- planlama, task ve sprint bilgileri
- bildirim logları
- ticket kayıtları
- benchmark sonuçları
- analytics ve raporlama verileri
- bakım, bütünlük kontrolü, istatistik ve vacuum operasyonları

CLI'da `logs`, `patterns`, `query`, `export` ve `db` komut yüzeyleri proje içindeki SQLite katmanına bağlıdır.

## Context, bellek ve öğrenme

- kaynak dosyalarını keşfedip code map üretme
- mimari kararları ve coding pattern'lerini çıkarıp dokümana yazma
- proje dosyalarını semantic index'e alma ve ilgili dosyaları sorgulama
- loop özetlerini kalıcı memory olarak kaydetme/yükleme
- token bütçesine göre context optimize etme
- hata pattern'i öğrenme ve evolved system prompt üretme
- başarı pattern'i/model profilini calibration verisiyle güncelleme
- prompt örnek/versiyon yönetimi ve fine-tune JSONL export

## Planlama

- task dependency çözümleme ve cycle/missing dependency hataları
- büyük işi alt görevlere bölme
- model/verifier destekli split plan
- geçmiş veriden effort/risk tahmini
- kapasiteye göre sprint planlama

## Benchmark ve analytics

- birden fazla model için benchmark loop'ları
- VRAM/uygunluk kontrolü
- başarı, süre, token ve maliyet sonuçları
- karşılaştırmalı benchmark raporu
- loop özeti, anomaliler, flaky test analizi ve raporlama sorguları
- SQL benzeri rapor isteğini güvenli rapor tanımına çevirme

## Bildirimler

- event bazlı mesaj formatlama
- dispatcher ile kanal seçimi, gönderim sonucu ve loglama
- Slack webhook
- Telegram
- e-posta
- masaüstü bildirimi
- ses
- periyodik digest başlatma/durdurma
- event-channel eşleştirme

Gerçek gönderimler ilgili kanal yapılandırması ve credential/client gerektirir.

## Git ve dış entegrasyonlar

- `SafeGit`: güvenli commit ve rollback
- GitHub pull request oluşturma
- Jira ticket işleme/güncelleme
- Notion
- Linear
- Obsidian
- Calendar
- Postman smoke test

Entegrasyon fonksiyonları client/credential ve etkin config gerektirir; varsayılan CLI workflow'ları bunların tamamını otomatik olarak bağlamaz.

## CLI komut envanteri

| Komut | Amaç | Mevcut üretim durumu |
|---|---|---|
| `init` | Projeyi hazırlar | Çalışıyor |
| `setup` | Config başlangıç ayarları | Varsayılan cevaplarla çalışıyor; interaktif prompt bağlı değil |
| `run` | Loop başlatır | Engine'e bağlı; gerçek generation bağımlılıkları varsayılan çağrıda eksik |
| `watch` | Değişiklikte loop çalıştırır | Çalışıyor; platform `fs.watch` davranışına bağlı |
| `verify` | Yapılandırılmış doğrulama testi | Çalışıyor |
| `test` | Configured test | Çalışıyor |
| `quality` | Quality gate | Çalışıyor |
| `resume` | Checkpoint geri yükleme | Çalışıyor; loop ID bekler |
| `replay` | Loop'u yeniden çalıştırma | Çalışıyor |
| `ui` | UI ve API | Vite client ve proje adapterıyla çalışıyor |
| `config show/set` | Config okuma/güncelleme | Çalışıyor; validation fallback'i dikkat gerektirir |
| `config-check` | Config doğrulama | Çalışıyor |
| `logs history/mcp/uncertain` | Log görüntüleme | SQLite'a bağlı |
| `patterns list/show/update/retire/import/export` | Pattern yönetimi | SQLite'a bağlı |
| `export` | Veri export | SQLite verisini redakte ederek dışa aktarır |
| `query` | Read-only sorgu | Tek SELECT ile sınırlandırılmış gerçek DB sorgusu |
| `voice` | Transcript komutu | Transcript'i işler; ses transkripsiyonu Core API'dedir |
| `codemap update` | Code map güncelleme | Çalışıyor |
| `db vacuum/stats/check` | DB bakımı | Çalışıyor |

## Web API envanteri

Fastify sunucusu:

- `GET /health`, `GET /api/health`
- `GET /api/dashboard`
- `GET /api/loops`
- `GET /api/loops/:id/turns`
- `GET /api/models`
- `GET /api/patterns`
- `GET /api/mcp`
- `GET /api/uncertain`
- `POST /api/uncertain/:id/resolve`
- `GET /api/quality`
- `GET /api/planning`
- `GET /api/reports`
- `GET /api/notifications`
- `GET /api/config` (secret redaction uygular)
- `POST /api/loop-control/:action`
- `POST /api/voice`
- `POST /api/ratings`
- `WS /ws` (bağlantı ve realtime event iletimi)

Route validation ve WebSocket event forwarding çalışır; CLI üzerinden başlatıldığında endpoint'ler seçilen projenin config ve SQLite verisini kullanır.

## React ekran/bileşen envanteri

Kaynakta aşağıdaki ekranlar vardır:

- Dashboard: durum, aktif loop, başarı oranı, maliyet, anomaly ve yakın loop'lar
- Loop detail: turn geçmişi ve loop görünümü
- Models: model listesi/profilleri
- MCP panel: server/kullanım görünümü
- Patterns: öğrenilmiş pattern'ler
- Uncertain tags: belirsizlik kayıtları ve çözümleme yüzeyi
- Quality: kalite durumu/metrikleri
- Planning: task ve plan görünümü
- Benchmark: model karşılaştırma sonuçları
- Reports: rapor listesi
- Settings: yapılandırma görünümü

Mevcut uygulama shell navigasyonu Dashboard, Loops, MCP ve Settings linklerini gösterir. Server Vite client asset'lerini servis eder; Dashboard quick action butonları API mutation'larını tetikler.

## Programatik Core API kullanım örneği

```ts
import {
  loadConfig,
  initProjectRuntime,
  runLoop,
  runQualityGate,
  scanSecrets,
  generateCodeMap,
} from '@dev-loop/core';

const projectDir = process.cwd();
initProjectRuntime(projectDir);
const config = await loadConfig({ projectDir });
const secrets = await scanSecrets({ projectDir });
const codeMap = await generateCodeMap({ projectDir });
const loop = await runLoop('FEATURE001', { projectDir });
```

Bazı API'lerin gerçek iş yapabilmesi için model, verifier, test runner, client veya callback bağımlılıkları verilmelidir. İlgili TypeScript tipleri bu adapter sözleşmelerini dışa aktarır.

## Çözülen denetim hataları

İlk denetimde açılan sekiz hata 10 Temmuz 2026 tarihinde çözülmüştür. Çözüm ve doğrulama notları `BUGS/` altındaki ilgili raporlarda korunmaktadır.

## Bu belge prompt karşılaştırmasında nasıl kullanılmalı?

Geliştirme promptu geldiğinde her istek şu statülerden biriyle eşleştirilmelidir:

- **Tam:** Üretim yolundan erişilebilir, gerçek adapter'a bağlı ve başarılı/başarısız davranışı test edilmiş.
- **Kısmi:** Core fonksiyonu veya UI bileşeni var ama CLI/UI üretim yoluna bağlanmamış.
- **Stub:** Komut/endpoint mevcut fakat sabit, boş veya yankı cevap döndürüyor.
- **Eksik:** Kaynakta karşılığı yok.
- **Ortamda doğrulanmadı:** Harici servis, credential, GPU veya ücretli API gerektiriyor.

Sadece dosya veya komut adının bulunması “tamamlandı” sayılmamalıdır; uçtan uca erişilebilirlik ve gerçek yan etki de doğrulanmalıdır.
