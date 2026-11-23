package baileyes.eyes.adapter.adapter.impl;

import baileyes.eyes.adapter.adapter.NewCatToy;
import baileyes.eyes.adapter.adapter.RoboCatToy;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class RoboToyAdapter implements NewCatToy {

    private static final String DEFAULT_PROGRAM = "chase-laser";

    private final RoboCatToy roboCatToy;

    @Override
    public String play() {
        return roboCatToy.start(DEFAULT_PROGRAM);
    }
}
