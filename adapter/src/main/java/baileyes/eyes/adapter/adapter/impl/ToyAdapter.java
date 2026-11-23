package baileyes.eyes.adapter.adapter.impl;

import baileyes.eyes.adapter.adapter.NewCatToy;
import baileyes.eyes.adapter.adapter.OldCatToy;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class ToyAdapter implements NewCatToy {

    private static final String DEFAULT_MODE = "classic";

    private final OldCatToy oldCatToy;

    @Override
    public String play() {
        return oldCatToy.playOldToy(DEFAULT_MODE);
    }
}
