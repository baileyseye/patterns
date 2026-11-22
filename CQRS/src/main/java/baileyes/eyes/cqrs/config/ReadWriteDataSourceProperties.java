package baileyes.eyes.cqrs.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.datasource")
public class ReadWriteDataSourceProperties {

    private Node primary = new Node();
    private Node replica = new Node();

    @Getter
    @Setter
    public static class Node {

        private String url;
        private String username;
        private String password;
        private int maximumPoolSize = 10;
    }
}
