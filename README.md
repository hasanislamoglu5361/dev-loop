# dev-loop

`dev-loop`, yapay zeka destekli geliştirme döngüleri kurmak için tasarlanan bir TypeScript monorepo projesidir. Amaç, bir isteği veya feature tanımını alıp planlama, kodlama, doğrulama, öğrenme, bildirim ve gözlemlenebilirlik adımlarını tek bir otomasyon çatısı altında toplayabilmektir.

Bu depo şu anda bu hedefin temel altyapı katmanlarını sağlar:

- yapılandırma dosyası okuma/yazma ve doğrulama,
- SQLite tabanlı kalıcı kayıt ve migration altyapısı,
- typed event bus,
- domain tipleri,
- token sayımı yardımcıları,
- CLI paketi,
- minimal UI server paketi,
- test, lint, typecheck, build ve paketleme kalitesi için monorepo iskeleti.

> Not: Proje erken aşamadadır. CLI şu anda temel komut yüzeyini sunar; tam otomatik "feature al, planla, kodla, doğrula, commit et" akışı henüz uçtan uca ürün komutu olarak tamamlanmış değildir. Core paketi bu akış için gerekli alt yapıyı hazırlamaktadır.

## İçindekiler

- [Ne işe yarar?](#ne-işe-yarar)
- [Şu an neler yapabiliyor?](#şu-an-neler-yapabiliyor)
- [Paket yapısı](#paket-yapısı)
- [Kurulum](#kurulum)
- [Temel komutlar](#temel-komutlar)
- [CLI kullanımı](#cli-kullanımı)
- [Core API kullanımı](#core-api-kullanımı)
- [Konfigürasyon](#konfigürasyon)
- [Veritabanı kullanımı](#veritabanı-kullanımı)
- [UI server kullanımı](#ui-server-kullanımı)
- [Build ve paketleme](#build-ve-paketleme)
- [Kalite kontrolleri](#kalite-kontrolleri)
- [Geliştirici notları](#geliştirici-notları)

## Ne işe yarar?

`dev-loop`, geliştirme sürecindeki tekrar eden karar ve doğrulama döngülerini kayıt altına alıp otomasyona bağlamak için hazırlanır. Hedeflenen kullanım modeli şudur:

1. Bir feature, bug veya geliştirme isteği tanımlanır.
2. Planlama modeli işi parçalara ayırır.
3. Kodlama modeli değişiklikleri üretir.
4. Test, lint, typecheck ve kalite kapıları çalıştırılır.
5. Hatalar öğrenme kayıtlarına dönüştürülür.
6. Başarılı ve başarısız loop sonuçları SQLite veritabanına yazılır.
7. Bildirim, UI ve raporlama katmanları bu kayıtları görünür kılar.

Mevcut repo, bu akışın temel kütüphane ve paketleme altyapısını sağlamaktadır.

## Şu an neler yapabiliyor?

### Konfigürasyon yönetimi

Core paketi `dev-loop.yaml` dosyasını okuyabilir, varsayılanlarla merge edebilir, Zod şemalarıyla doğrulayabilir ve tekrar YAML olarak kaydedebilir.

Desteklenen yapılandırma alanlarından bazıları:

- `planning`
- `coding`
- `verifier`
- `fallback`
- `loop`
- `test_runner`
- `quality_gate`
- `mcp`
- `context`
- `learning`
- `notifications`
- `integrations`
- `git`
- `agents`
- `ui`
- `voice`
- `observability`

Yapılandırma içinde `${ENV_VAR}` biçiminde ortam değişkeni interpolasyonu desteklenir. Ayrıca `DEV_LOOP_*` ortam değişkenleriyle override uygulanabilir.

### SQLite veritabanı ve migration

Core paketi `better-sqlite3` ile SQLite bağlantısı açabilir, migration çalıştırabilir ve loop geçmişi gibi kayıtları saklamak için tablo altyapısı sağlar.

Mevcut DB alanları şunları kapsar:

- loop geçmişi,
- loop turn kayıtları,
- hata ve başarı pattern kayıtları,
- model profilleri,
- MCP kullanım ve hata kayıtları,
- kalite sonuçları,
- bildirim logları,
- ticket kayıtları,
- benchmark sonuçları.

### Typed event bus

`EventBus`, TypeScript ile tiplenmiş olay isimleri ve payload eşleşmeleri sunar. Örneğin:

- `loop:start`
- `loop:end`
- `loop:error`
- `model:switch`
- `mcp:error`
- `quality:gate`
- `notification`

Yanlış event payload'ları compile-time seviyesinde yakalanacak şekilde tasarlanmıştır.

### Token sayımı

Core paketi metin, chat mesajları ve dosya içerikleri için token tahmini yapabilir. OpenAI uyumlu model adlarında `tiktoken` kullanmayı dener; mümkün olmazsa güvenli heuristic sayaca düşer.

### CLI paketi

`@dev-loop/cli`, `dev-loop` komutunu üretir. Şu an temel Commander yüzeyi hazırdır:

```bash
node packages/cli/dist/main.js --help
```

Örnek çıktı:

```text
Usage: dev-loop [options]

AI-powered development loop automation

Options:
  -V, --version  output the version number
  -h, --help     display help for command
```

### UI server paketi

`@dev-loop/ui`, Fastify tabanlı minimal server factory sağlar. Şu an `/health` endpoint'i vardır.

```ts
import { createUiServer } from '@dev-loop/ui';

const app = createUiServer();
await app.listen({ port: 3747, host: 'localhost' });
```

Health endpoint:

```bash
curl http://localhost:3747/health
```

Beklenen cevap:

```json
{ "ok": true }
```

## Paket yapısı

```text
.
├── packages
│   ├── cli
│   │   └── src
│   ├── core
│   │   └── src
│   └── ui
│       └── src
├── package.json
├── turbo.json
├── tsconfig.base.json
├── vitest.config.ts
└── eslint.config.js
```

### `packages/core`

Ana kütüphane paketidir. Şunları dışa aktarır:

- config loader API'leri,
- error class'ları,
- typed event bus,
- domain tipleri,
- token sayacı yardımcıları,
- DB bağlantı, migration ve query yardımcıları.

### `packages/cli`

Komut satırı paketidir. `dev-loop` binary entrypoint'i `dist/main.js` üzerinden çalışır.

### `packages/ui`

Fastify tabanlı UI/server paketidir. Şu an minimal sağlık kontrolü endpoint'i sağlar.

## Kurulum

Gereksinimler:

- Node.js `>=20`
- npm `>=10`

Bağımlılıkları kurmak için:

```bash
npm install
```

## Temel komutlar

Testleri çalıştır:

```bash
npm test
```

TypeScript typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Tüm paketleri derle:

```bash
npm run build
```

Cache'i bypass ederek deterministik build:

```bash
npm run build -- --force
```

Coverage:

```bash
npm run test:coverage
```

Format:

```bash
npm run format
```

## CLI kullanımı

Önce build alın:

```bash
npm run build -- --force
```

CLI yardım ekranını açın:

```bash
node packages/cli/dist/main.js --help
```

Paket binary tanımı:

```json
{
  "bin": {
    "dev-loop": "./dist/main.js"
  }
}
```

Geliştirme sırasında workspace paketi olarak kullanılabilir:

```bash
npm --workspace @dev-loop/cli run build
```

## Core API kullanımı

### Konfigürasyon yükleme

```ts
import { loadConfig } from '@dev-loop/core';

const config = await loadConfig({
  projectDir: process.cwd(),
});

console.log(config.loop.max_retry);
```

Eğer `dev-loop.yaml` yoksa varsayılan yapılandırma döner.

### Varsayılan config oluşturma

```ts
import { createDefaultConfig } from '@dev-loop/core';

const configPath = await createDefaultConfig(process.cwd());
console.log(configPath);
```

Bu komut mevcut dosyanın üzerine yazmaz; dosya yoksa `dev-loop.yaml` oluşturur.

### Config güncelleme

```ts
import { saveConfig } from '@dev-loop/core';

await saveConfig(process.cwd(), {
  loop: {
    max_retry: 3,
  },
});
```

### EventBus

```ts
import { EventBus } from '@dev-loop/core';

const bus = new EventBus();

const unsubscribe = bus.on('loop:end', payload => {
  console.log(payload.loopId, payload.success);
});

bus.emit('loop:end', {
  loopId: 'loop-1',
  success: true,
});

unsubscribe();
```

### Token sayımı

```ts
import { countTokens, countChatTokens } from '@dev-loop/core';

const textCount = await countTokens('Merhaba dünya', {
  model: 'gpt-4o',
});

const chatCount = countChatTokens([
  { role: 'system', content: 'Kısa cevap ver.' },
  { role: 'user', content: 'dev-loop nedir?' },
]);

console.log({ textCount, chatCount });
```

## Konfigürasyon

Örnek minimal `dev-loop.yaml`:

```yaml
version: "1"

coding:
  primary:
    provider: auto
    model: auto
    temperature: 0.2
    max_tokens: 16384

loop:
  max_retry: 5
  retry_delay_seconds: 2
  diff_aware: true
  sandbox_mode: true

ui:
  port: 3747
  host: localhost
  open_browser: true
```

Ortam değişkeni interpolasyonu:

```yaml
planning:
  primary:
    provider: anthropic
    model: claude-sonnet-4-6
    api_key: ${ANTHROPIC_API_KEY}
```

Ortam değişkeni override örneği:

```bash
DEV_LOOP_CODING_PRIMARY_MAX_TOKENS=4096
```

## Veritabanı kullanımı

DB subpath export'u `@dev-loop/core/db` üzerinden kullanılabilir.

```ts
import {
  initDatabase,
  closeDatabase,
  createLoop,
  updateLoop,
  createLoopTurn,
} from '@dev-loop/core/db';

const db = initDatabase('./dev-loop.sqlite');

const loop = await createLoop('feature-001', {
  primaryModel: 'gpt-4o',
  verifierModel: 'claude-sonnet-4-6',
  fallbackUsed: false,
});

await createLoopTurn({
  loopId: loop.id,
  turnNumber: 1,
  agent: 'coding',
  model: 'gpt-4o',
  success: true,
});

await updateLoop(loop.id, {
  success: true,
});

closeDatabase();
```

`initDatabase()` çağrısı migration'ları otomatik çalıştırır.

## UI server kullanımı

```ts
import { createUiServer } from '@dev-loop/ui';

const app = createUiServer();

await app.listen({
  host: 'localhost',
  port: 3747,
});
```

Health kontrolü:

```bash
curl http://localhost:3747/health
```

## Build ve paketleme

Paketler `dist` altına derlenir. Build scriptleri temiz build alır; stale `tsconfig.tsbuildinfo` veya eksik `dist` dosyaları nedeniyle yeşil ama bozuk build kalmaması hedeflenir.

Core paketi runtime build için ayrı config kullanır:

```text
packages/core/tsconfig.build.json
```

Bu dosya testleri production emit'ten hariç tutar.

Paket dry-run kontrolü:

```bash
npm pack --workspace @dev-loop/core --dry-run --json
npm pack --workspace @dev-loop/cli --dry-run --json
npm pack --workspace @dev-loop/ui --dry-run --json
```

Beklenen:

- `dist/index.js` ve `dist/index.d.ts` pakete girer.
- `src/__tests__` pakete girmez.
- `dist/__tests__` pakete girmez.

## Kalite kontrolleri

Bu repoda beklenen kalite kapısı:

```bash
npm test
npm run typecheck
npm run lint
npm run build -- --force
node packages/cli/dist/main.js --help
node -e "await import('./packages/core/dist/index.js'); await import('./packages/core/dist/db/index.js'); await import('./packages/cli/dist/index.js'); await import('./packages/ui/dist/index.js'); console.log('dist imports ok')"
```

Son doğrulama durumunda:

- testler geçiyor,
- typecheck geçiyor,
- lint warning üretmeden geçiyor,
- force build geçiyor,
- built entrypoint import smoke test geçiyor,
- package dry-run kontrolleri dist odaklı ve testlerden arınmış çıktı üretiyor.

## Geliştirici notları

- Testler `packages/core/src/__tests__` altında yoğunlaşmıştır.
- `BUGS/` klasörü yerel bug prompt kuyruğu için kullanılır ve `.gitignore` kapsamındadır.
- `KNOWLEDBASE.md`, yerel modelin sonraki işlerde kullanması için karar, hata ve çözüm kayıtlarını içerir.
- Build çıktıları ve `tsconfig.tsbuildinfo` dosyaları takip edilmez.
- Yeni public API eklerken `packages/core/src/index.ts` veya `packages/core/src/db/index.ts` üzerinden bilinçli export yapılmalıdır.
- Production build'e test artifact'i sokmamak için core tarafında `tsconfig.build.json` kullanılmalıdır.

## Lisans

MIT
