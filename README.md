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
| 04 | **Chains** (Chain of Responsibility) | `chains/` | `ChainManager` прогоняет `ProcessDataDto` через `List<ChainPart>` с сортировкой по `@Order`. Классы: `ChainPart`, `FirstChainPart`, `SecondChainPart`, `ChainManager` |

### GoF · Structural (Структурные)

> *Композиция классов и объектов*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 05 | **Adapter** | `adapter/` | `ToyAdapter` приводит `OldCatToy.play()` к интерфейсу `NewCatToy` |
| 06 | **Bridge** | `bridge/` | `Animal` + `AnimalBehavior`: две независимые иерархии через `@Qualifier` |
| 07 | **Decorator** | `decorator/` | `BaseServiceDecorator(FirstDecorator(BaseService))` — слои без изменения базы. DTO-декорирование |
| 08 | **Facade + async composition** | `facade/`, `api-composition/` | `Facade.performTasks()` = `taskA.thenCombine(taskB)` — ~2 сек вместо ~4. Классы: `Facade`, `SubsystemA`, `SubsystemB`, `AsyncService` |

### Spring Infrastructure (Инфраструктура Spring)

> *Стартеры, аспекты и сквозная инфраструктура*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 09 | **Circuit-breaker** (Spring Aspect) | `circuit-breaker/` | AOP-стартер с аннотацией `@CircuitBreaker`. Конфигурация через `application.yml` |
| 10 | **GlobalExceptionHandler** | `exceptionhandler/` | Централизованная обработка ошибок через `@RestControllerAdvice`. Иерархия `AppException` |
| 11 | **Logger-starter** | `logger-starter/` | Цветной логгер с настраиваемыми уровнями, конфиг через `application.yml` |
| 12 | **Kafka-starter** | `kafka-starter/` | Producer + Consumer с кастомным JSON-сериализатором, автосхема через `.avsc`. Idempotent-отправка |

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

Визуализация цепочки обработки данных: `ChainManager → FirstChainPart → SecondChainPart → Result`. Порядок шагов определяется `@Order` Spring.

![Chains Demo](docs/screenshots/02-chains-demo.png)

### Chains — Java-код

Реализация `FirstChainPart` с `@Order(1)` — порядок шагов определяется Spring.

![Chains Code](docs/screenshots/03-chains-code.png)

### Kafka — Продвинутый режим

Producer → Broker (partitions) → Consumer + live-логи. Переключатели `broker down` / `idempotence`, визуализация партиций и логов `KafkaProducerServiceImpl`.

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
