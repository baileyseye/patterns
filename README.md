# Design Patterns · baileyes/eyes

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

## 🎯 Паттерны

### GoF · Creational (Порождающие)

> *Кто и как создаёт объекты*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 08 | **Factory Method + Abstract Factory** | `Factory/` | `ToyFactory.someOperation()` + `PetToyFactory` — два уровня фабрик. Продукты: `PetToy`, `BallToy`, `RopeToy`, `DogChewToy`, `CatScratcher` |

### GoF · Structural (Структурные)

> *Композиция классов и объектов*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 04 | **Adapter** | `Adapter/` | `ToyAdapter` приводит `OldCatToy.play()` к интерфейсу `NewCatToy` |
| 05 | **Bridge** | `Bridge/` | `Animal` + `AnimalBehavior`: две независимые иерархии через `@Qualifier` |
| 06 | **Decorator** | `Decorator/` | `BaseServiceDecorator(FirstDecorator(BaseService))` — слои без изменения базы. DTO-декорирование |
| 07 | **Facade + async composition** | `Facade/`, `api-composition/` | `Facade.performTasks()` = `taskA.thenCombine(taskB)` — ~2 сек вместо ~4. Классы: `Facade`, `SubsystemA`, `SubsystemB`, `AsyncService` |

### GoF · Behavioral (Поведенческие)

> *Распределение ответственности*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 01 | **Strategy** | `Strategy/` | `EnumMap<Animals, AnimalStrategy>` внутри `AnimalContext`. Стратегии: `CatStrategy`, `DogStrategy` |
| 02 | **State** | `State/` | Конечный автомат жизненного цикла документа в константах `enum DocumentState`. Классы: `Document`, `DocumentService` |
| 03 | **Chains** (Chain of Responsibility) | `Chains/` | `ChainManager` прогоняет `ProcessDataDto` через `List<ChainPart>` с сортировкой по `@Order`. Классы: `ChainPart`, `FirstChainPart`, `SecondChainPart`, `ChainManager` |

### Spring Infrastructure (Инфраструктура Spring)

> *Стартеры, аспекты и сквозная инфраструктура*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 09 | **Circuit-breaker** (Spring Aspect) | `Circuit-breaker/` | AOP-стартер с аннотацией `@CircuitBreaker`. Конфигурация через `application.yml` |
| 10 | **GlobalExceptionHandler** | `ExceptionHandler/` | Централизованная обработка ошибок через `@RestControllerAdvice`. Иерархия `AppException` |
| 11 | **Logger-starter** | `Logger-starter/` | Цветной логгер с настраиваемыми уровнями, конфиг через `application.yml` |
| 12 | **Kafka-starter** | `Kafka-starter/` | Producer + Consumer с кастомным JSON-сериализатором, автосхема через `.avsc`. Idempotent-отправка |

### Integration (Интеграция)

> *Агрегация и согласованность удалённых микросервисов*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 13 | **api-composition (BFF)** | `api-composition/` | Backend-for-Frontend с Feign-клиентами, DTO-трансформацией, `@Qualifier` для бэкингов |
| 14 | **Transactional Outbox** | `Transactional-outbox/` | `OrderService.createOrder()` пишет `orders` и `outbox_event` в одной `@Transactional`-транзакции; `OutboxRelay` публикует `PENDING`-события в Kafka и помечает их `PUBLISHED` |
| 15 | **Transactional Inbox** | `Transactional-inbox/` | `@KafkaListener` + `inbox_message` с PK `messageId`: consumer сначала делает `INSERT` в inbox, дубль отклоняется unique-ключом, затем inbox и проекция коммитятся одной транзакцией |

### Reliability (Надёжность)

> *Лимиты, повторы и изоляция сбоев*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 16 | **Rate Limiter** | `Rate-limiter/` | Token bucket на ключ (user/IP/tenant): burst в пределах capacity, refill, `429 + Retry-After`; in-memory или атомарный Redis Lua |
| 17 | **Retry + Jitter** | `Retry-jitter/` | Exponential backoff с full jitter: `base × 2^attempt` + случайный разброс, чтобы клиенты не устраивали retry storm |
| 18 | **Dead Letter Topic** | `Dead-letter-topic/` | `DefaultErrorHandler` + `DeadLetterPublishingRecoverer`: после исчерпания повторов poison message уходит в `orders.DLT`, затем replay |
| 19 | **Retry Topic** | `Retry-topic/` | `@RetryableTopic`: неблокирующие повторы через `orders-retry-0/1/2`, после них — `orders.DLT`, основной consumer продолжает работу |
| 20 | **Backpressure** | `Backpressure/` | Bounded queue + `ThreadPoolExecutor` + rejection policy: Abort → 429/503, CallerRuns, DiscardOldest, Discard |

### Distributed Data (Распределённые данные)

> *Согласованность и маршрутизация чтения/записи*

| # | Паттерн | Модуль | Описание |
|---|---------|--------|----------|
| 21 | **CQRS + read/write splitting** | `CQRS/` | PostgreSQL StatefulSet + headless Service: `@Transactional` → primary, `@Transactional(readOnly=true)` → реплики через `ReadWriteRoutingDataSource`; отдельно показан replication lag и read-your-writes |

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
Patterns/
├── src/main/
│   ├── java/.../patterns/       # Главный Application
│   └── resources/static/        # Фронтенд (HTML/CSS/JS)
├── Strategy/                    # Strategy
├── State/                       # State
├── Chains/                      # Chain of Responsibility
├── Factory/                     # Factory + Abstract Factory
├── Adapter/                     # Adapter
├── Bridge/                      # Bridge
├── Decorator/                   # Decorator
├── Facade/                      # Facade
├── Circuit-breaker/             # Spring AOP Circuit Breaker
├── ExceptionHandler/            # Global Exception Handler
├── Logger-starter/              # Color Logger Starter
├── Kafka-starter/               # Kafka Producer/Consumer
├── api-composition/             # BFF (Backend-for-Frontend)
├── Transactional-outbox/        # Outbox: atomic DB write + Kafka relay
├── Transactional-inbox/         # Inbox: idempotent Kafka consumer
├── Rate-limiter/                # Token bucket: local / Redis
├── Retry-jitter/                # Exponential backoff + full jitter
├── Dead-letter-topic/           # Kafka DLT + replay
├── Retry-topic/                 # Non-blocking Kafka retries
├── Backpressure/                # Bounded queue + rejection policy
└── CQRS/                        # PostgreSQL primary/replica routing
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
