package baileyes.eyes.adapter.adapter;

/**
 * Старый API игрушки. Он не реализует {@link NewCatToy} и имеет
 * собственное имя метода, поэтому напрямую клиенту не подходит.
 */
public class OldCatToy {

    public String playOldToy(String mode) {
        return "Old toy plays in " + mode + " mode";
    }
}
