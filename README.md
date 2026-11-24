# patterns · baileyes/eyes

Интерактивная визуализация паттернов проектирования (GoF) на **Java Spring Boot** — с живыми JS-демо, UML-структурами и исходным кодом.

[![Java 8+](https://img.shields.io/badge/Java-8%2B-orange?style=flat-square&logo=java)](https://www.oracle.com/java/)
[![Spring Boot 2.7](https://img.shields.io/badge/Spring%20Boot-2.7.18-brightgreen?style=flat-square&logo=spring)](https://spring.io/projects/spring-boot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)
[![No Dependencies](https://img.shields.io/badge/Frontend-No%20CDN%2FBuilds-blue?style=flat-square)](./src/main/resources/static/)

---

## 📦 Что внутри

| Раздел | Описание |
|--------|----------|
| **21** паттерн | 8 GoF-паттернов + 4 инфраструктурных модуля Spring + 3 интеграционных + 5 reliability + 1 distributed data |
| **7** категорий | Creational, Structural, Behavioral, Spring Infra, Integration + Reliability + Distributed Data |
| **~125** Java-классов | Реальные реализации, не псевдокод |
| **0** внешних зависимостей | Фронтенд — чистый HTML/CSS/JS, без CDN и сборщиков |

---

## 🚀 Быстрый старт

```bash
# Сборка
./gradlew build

# Запуск (встроенный Tomcat)
java -jar build/patterns-visualization-0.0.1-SNAPSHOT.jar

# Открыть
http://localhost:8080
```

Фронтенд статический — отдаётся встроенным Tomcat из `src/main/resources/static/`.

---

## 🌐 Деплой на GitHub Pages

Фронтенд не делает запросов к бэкенду — все интерактивные демо выполняются в браузере, поэтому сайт можно публиковать как обычную статику.

Workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) при пуше в `master` копирует `src/main/resources/static/` и публикует его на GitHub Pages.

1. В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Запушьте в `master` (или запустите вручную: **Actions → Deploy frontend to GitHub Pages → Run workflow**).
3. Сайт будет доступен по адресу `https://baileyseye.github.io/patterns/`.

Альтернативы без настройки Actions — Cloudflare Pages, Netlify или Vercel: укажите корень `src/main/resources/static`, пустую команду сборки и отсутствие фреймворка.

---

## 🎯 Паттерны

### GoF · Creational (Порождающие)

> *Кто и как создаёт объекты*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 01 | **Factory Method + Abstract Factory** | `factory/` | `ToyFactory.someOperation()` + `PetToyFactory` — два уровня фабрик. Продукты: `PetToy`, `BallToy`, `RopeToy`, `DogChewToy`, `CatScratcher` |

### GoF · Behavioral (Поведенческие)

> *Распределение ответственности*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 02 | **Strategy** | `strategy/` | `Map<Animals, AnimalStrategy>` внутри `AnimalContext`: выбор стратегии без `switch`. Стратегии: `CatStrategy`, `DogStrategy` |
| 03 | **State** | `state/` | Жизненный цикл документа из пяти состояний: три нетерминальных (`UNDER_REVIEW`, `AWAITING_CONFIRMATION`, `REVISION_REQUIRED`) и два терминальных. Переходы заданы в `enum DocumentState`. Классы: `Document`, `DocumentService` |
| 04 | **Chains** (Chain of Responsibility) | `chains/` | `ChainManager` прогоняет `ProcessDataDto` через `List<ChainPart>` с сортировкой по `@Order`; на каждом звене DTO меняется. Второй фрейм — `VariantChainManager` + `@ConditionalOnProperty(chain.mode)`: стратегия `address` (`1,3,5,7` — нормализация адреса) или `delivery` (`2,4,6,8` — обогащение доставки) выбирается Spring (Strategy внутри Chain) |

### GoF · Structural (Структурные)

> *Композиция классов и объектов*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 05 | **Adapter** | `adapter/` | `ToyAdapter` и `RoboToyAdapter` приводят несовместимые legacy API (`OldCatToy.playOldToy(mode)`, `RoboCatToy.start(program)`) к контракту `NewCatToy.play()`. Клиент `AdapterService` не меняется, а новый источник подключается новым адаптером |
| 06 | **Bridge** | `bridge/` | `Animal` + `AnimalBehavior`: две независимые иерархии. `BridgeService` зависит только от `List<Animal>` и вызывает `showBehavior()`, а `@Qualifier` связывает `HappyCat` с `CatBehavior`, `HappyDog` с `DogBehavior` |
| 07 | **Decorator** | `decorator/` | `BaseServiceDecorator` оборачивает `BaseService`: `FirstDecorator`, `SecondDecorator` и `ThirdDecorator` добавляют свои части в `RandomDataDTO.data`. Башня собирается в runtime через `performDecoratedAction(first, second, third)`, без 2^N подклассов и изменений `BaseService`. В демо — башня слева, трасса вызова справа и сравнение с Proxy: расширение результата против контроля/замены вызова |
| 08 | **Facade + async composition** | `facade/`, `api-composition/` | `Facade.performTasks()` = `taskA.thenCombine(taskB)`. При параллельном запуске итог равен `max(A, B)`, а не сумме; клиент делает один вызов и не знает про подсистемы. Классы: `Facade`, `SubsystemA`, `SubsystemB`, `AsyncService` |

### Spring Infrastructure (Инфраструктура Spring)

> *Стартеры, аспекты и сквозная инфраструктура*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 09 | **Circuit-breaker** (Spring Aspect) | `circuit-breaker/` | `CircuitBreakerAspect` автоматически оборачивает service-методы в `defaultCircuitBreaker`. Если в классе уже есть поле `CircuitBreaker`, аспект делает `pjp.proceed()` и не навязывает default-политику: сервис сам вызывает `userDataCircuitBreaker` со своими порогами. В демо — два набора метрик и режим «сервис сам держит CircuitBreaker» |
| 10 | **GlobalExceptionHandler** | `exceptionhandler/` | Централизованная обработка ошибок через `@RestControllerAdvice` + `@ExceptionHandler`: тип исключения → HTTP-статус и `ErrorResponse`. `@Order(Integer.MIN_VALUE)` защищает security-логику от конфликтующего handler-а; `buildErrorResponseEntity` добавляет suppressed-исключения, не меняя статус |
| 11 | **Logger-starter** | `logger-starter/` | Цветной аспект-логгер: перехватывает `..controller..*` и `..service..*`, красит строки по HTTP-методу (GET — зелёный, POST — жёлтый, DELETE — красный), service — синий, ошибки — ярко-красный. Конфиг через auto-configuration |
| 12 | **Kafka-starter** | `kafka-starter/` | Producer + Consumer: acks 0/1/all, `min.insync.replicas`, idempotence и транзакции, партиции vs consumer group, broadcast через unique group, версии ConsumerOld/ConsumerNew. Кастомный JSON/Avro |

### Integration (Интеграция)

> *Агрегация и согласованность удалённых микросервисов*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 13 | **api-composition (BFF)** | `api-composition/` | Backend-for-Frontend с Feign-клиентами, DTO-трансформацией, `@Qualifier` для бэкингов |
| 14 | **Transactional Outbox** | `transactional-outbox/` | `OrderService.createOrder()` пишет `orders` и `outbox_event` в одной `@Transactional`-транзакции; `OutboxRelay` публикует `PENDING`-события в Kafka и помечает их `PUBLISHED` |
| 15 | **Transactional Inbox** | `transactional-inbox/` | `@KafkaListener` + `inbox_message` с PK `messageId`: consumer сначала делает `INSERT` в inbox, дубль отклоняется unique-ключом, затем inbox и проекция коммитятся одной транзакцией |

### Reliability (Надёжность)

> *Лимиты, повторы и изоляция сбоев*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 16 | **Rate Limiter** | `rate-limiter/` | Token bucket на ключ (user/IP/tenant): burst в пределах capacity, refill, `429 + Retry-After`; in-memory или атомарный Redis Lua |
| 17 | **Retry + Jitter** | `retry-jitter/` | Exponential backoff с full jitter: `base × 2^attempt` + случайный разброс, чтобы клиенты не устраивали retry storm |
| 18 | **Dead Letter Topic** | `dead-letter-topic/` | `DefaultErrorHandler` + `DeadLetterPublishingRecoverer`: после исчерпания повторов poison message уходит в `orders.DLT`, затем replay |
| 19 | **Retry Topic** | `retry-topic/` | `@RetryableTopic`: неблокирующие повторы через `orders-retry-0/1/2`, после них — `orders.DLT`, основной consumer продолжает работу |
| 20 | **Backpressure** | `backpressure/` | Bounded queue + `ThreadPoolExecutor` + rejection policy: Abort → 429/503, CallerRuns, DiscardOldest, Discard |

### Distributed Data (Распределённые данные)

> *Согласованность и маршрутизация чтения/записи*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 21 | **CQRS + read/write splitting** | `cqrs/` | PostgreSQL StatefulSet + headless Service: `@Transactional` → primary, `@Transactional(readOnly=true)` → реплики через `ReadWriteRoutingDataSource`; отдельно показан replication lag и read-your-writes |

---

## 🖥 Скриншоты

### Главный экран

Общий интерфейс визуализации — навигация по паттернам, категории, карточки с UML-схемами.

![Главный экран](docs/screenshots/01-overview.png)

### Chains — Интерактивное демо

Визуализация цепочки обработки данных: `ChainManager → FirstChainPart → SecondChainPart → Result`. Порядок шагов определяется `@Order` Spring, а под пайплайном виден снимок `ProcessDataDto` на каждом этапе — какие поля изменило каждое звено.

Второй фрейм показывает синергию с **Strategy**: `VariantChainManager` инжектит `List<VariantChainPart>`, а `@ConditionalOnProperty(name = "chain.mode")` оставляет в контексте либо стратегию `address` — звенья `1,3,5,7` (нормализация адреса), либо `delivery` — звенья `2,4,6,8` (обогащение доставки). Менеджер и интерфейс не меняются — меняется стратегия сборки цепочки.

![Chains Demo](docs/screenshots/02-chains-demo.png)

### Chains — Java-код

`FirstChainPart` и `SecondChainPart` реально преобразуют `AddressData` и возвращают новый `ProcessDataDto`. Вариативные звенья помечены `@ConditionalOnProperty`, а `VariantChainManager` работает с тем списком, который собрал Spring.

![Chains Code](docs/screenshots/03-chains-code.png)

### Kafka — Продвинутый режим

Четыре интерактивных фрейма: ACKs/ISR и отказы, партиции vs consumers в группе, broadcast с unique group, миграция ConsumerOld/ConsumerNew. Показаны `acks=0/1/all`, `min.insync.replicas`, падения producer/consumer, недоступный топик и правило «1 partition → 1 consumer».

![Kafka Advanced](docs/screenshots/04-kafka-advanced.png)

---

## 🏗 Архитектура проекта

```
patterns/
├── src/main/
│   ├── java/.../patterns/       # Главный Application
│   └── resources/static/        # Фронтенд (HTML/CSS/JS)
├── strategy/                    # Strategy
├── state/                       # State
├── chains/                      # Chain of Responsibility
├── factory/                     # Factory + Abstract Factory
├── adapter/                     # Adapter
├── bridge/                      # Bridge
├── decorator/                   # Decorator
├── facade/                      # Facade
├── circuit-breaker/             # Spring AOP Circuit Breaker
├── exceptionhandler/            # Global Exception Handler
├── logger-starter/              # Color Logger Starter
├── kafka-starter/               # Kafka Producer/Consumer
├── api-composition/             # BFF (Backend-for-Frontend)
├── transactional-outbox/        # Outbox: atomic DB write + Kafka relay
├── transactional-inbox/         # Inbox: idempotent Kafka consumer
├── rate-limiter/                # Token bucket: local / Redis
├── retry-jitter/                # Exponential backoff + full jitter
├── dead-letter-topic/           # Kafka DLT + replay
├── retry-topic/                 # Non-blocking Kafka retries
├── backpressure/                # Bounded queue + rejection policy
└── cqrs/                        # PostgreSQL primary/replica routing
```

Каждый паттерн — отдельный Gradle-модуль со своим `*Application.java` и встроенным Tomcat.

---

## 📋 Технологии

| Слой | Стек |
|------|------|
| **Backend** | Java 8, Spring Boot 2.7.18, Spring Web, Spring Data JPA, Lombok, SLF4J |
| **Integration** | Kafka (Confluent Avro schema), Spring Kafka DLT/Retry Topics, Transactional Outbox/Inbox |
| **Reliability** | Token bucket, Spring Retry, custom `ThreadPoolExecutor` backpressure |
| **Data** | PostgreSQL StatefulSet + headless Service, primary/replica routing |
| **AOP** | Spring AOP (Circuit Breaker, Exception Handler, Rate Limit, Retry) |
| **Frontend** | Vanilla HTML5, CSS3 (Grid/Flexbox, custom properties), ES6+ |
| **Сборка** | Gradle 8.5 (dual: Gradle + Maven pom.xml) |

---

## 📄 License

[MIT](./LICENSE) © 2026 baileyes/eyes
