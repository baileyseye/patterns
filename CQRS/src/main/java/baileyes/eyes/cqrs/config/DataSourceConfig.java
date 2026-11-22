package baileyes.eyes.cqrs.config;

import baileyes.eyes.cqrs.datasource.ReadWriteRoutingDataSource;
import com.zaxxer.hikari.HikariDataSource;
import java.util.HashMap;
import java.util.Map;
import javax.sql.DataSource;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;

@Configuration
@EnableConfigurationProperties(ReadWriteDataSourceProperties.class)
@RequiredArgsConstructor
public class DataSourceConfig {

    private final ReadWriteDataSourceProperties properties;

    @Bean(name = "primaryDataSource")
    public DataSource primaryDataSource() {
        return createDataSource(properties.getPrimary());
    }

    @Bean(name = "replicaDataSource")
    public DataSource replicaDataSource() {
        return createDataSource(properties.getReplica());
    }

    @Bean
    @Primary
    public DataSource dataSource(
        @Qualifier("primaryDataSource") DataSource primary,
        @Qualifier("replicaDataSource") DataSource replica
    ) {
        Map<Object, Object> targets = new HashMap<>();
        targets.put(ReadWriteRoutingDataSource.PRIMARY, primary);
        targets.put(ReadWriteRoutingDataSource.REPLICA, replica);

        ReadWriteRoutingDataSource routing = new ReadWriteRoutingDataSource();
        routing.setTargetDataSources(targets);
        routing.setDefaultTargetDataSource(primary);
        routing.afterPropertiesSet();

        // Соединение берётся после старта транзакции,
        // когда @Transactional(readOnly = true) уже известен.
        return new LazyConnectionDataSourceProxy(routing);
    }

    private DataSource createDataSource(ReadWriteDataSourceProperties.Node node) {
        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(node.getUrl());
        dataSource.setUsername(node.getUsername());
        dataSource.setPassword(node.getPassword());
        dataSource.setMaximumPoolSize(node.getMaximumPoolSize());
        return dataSource;
    }
}
