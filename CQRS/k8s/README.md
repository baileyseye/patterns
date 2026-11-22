# PostgreSQL StatefulSet + read/write splitting

Схема для CQRS-lite:

- `postgres-0.postgres-headless` — primary: сюда идут `@Transactional`-команды.
- `postgres-1.postgres-headless`, `postgres-2.postgres-headless` — реплики.
- Headless Service (`clusterIP: None`) даёт стабильные DNS-имена pod-ов, но **не балансирует** запросы между репликами.
- Для чтения нужен отдельный read-service/оператор (Patroni, CloudNativePG `-ro` service и т.п.),
  который отдаёт только реплики. Не отправляйте read-трафик на все pod-ы headless-сервиса:
  иначе часть чтений попадёт на primary, а часть — на отстающие реплики.

Важно:

1. Не хардкодьте `postgres-0` как primary в приложении. При failover primary может переехать;
   используйте service/endpoint, который оператор переключает на актуальный primary.
2. Read-only routing делайте через `@Transactional(readOnly = true)` и
   `LazyConnectionDataSourceProxy`, иначе соединение может быть получено до старта транзакции.
3. Помните о replication lag: сразу после записи чтение с реплики может вернуть старые данные.
   Для read-your-writes используйте primary или дождитесь применения WAL (например, LSN wait).
4. Держите отдельные HikariCP pools для primary и реплик: у них разная нагрузка и разные лимиты.
