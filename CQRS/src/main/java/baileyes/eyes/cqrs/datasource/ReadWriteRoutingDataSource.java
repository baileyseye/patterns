package baileyes.eyes.cqrs.datasource;

import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Выбирает узел по режиму транзакции:
 * readOnly=true -> реплика, обычная транзакция -> primary.
 *
 * В production replica — это отдельный read-service, который
 * балансирует запросы между pod-ами StatefulSet.
 */
public class ReadWriteRoutingDataSource extends AbstractRoutingDataSource {

    public static final String PRIMARY = "primary";
    public static final String REPLICA = "replica";

    @Override
    protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
            ? REPLICA
            : PRIMARY;
    }
}
