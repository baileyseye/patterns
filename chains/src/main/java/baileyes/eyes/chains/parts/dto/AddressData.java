package baileyes.eyes.chains.parts.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Данные, которые последовательно преобразуются звеньями цепочки.
 */
@Setter
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddressData {

    private String city;
    private String street;
    private String zip;
    private String formatted;
    private String geo;
    private String phone;
    private String delivery;
    private String signature;
    private String audit;
}
