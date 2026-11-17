## Power-market basics (general background, not specific to depower)

- **Day-ahead auction.** Electricity for each hour (now each 15 minutes) of the next day is traded in a single daily auction at 12:00 Berlin time, run jointly across Europe (Single Day-Ahead Coupling). Germany and Luxembourg form one bidding zone, DE-LU. Results are published in the early afternoon.
- **Units.** Wholesale prices are quoted in EUR per megawatt-hour (EUR/MWh). 100 EUR/MWh equals 10 cents per kWh. A household bill is much higher than the wholesale price because it adds grid fees, taxes, levies and the supplier's margin.
- **Why prices move during the day.** Prices usually rise in the morning and evening when demand is high and solar output is low, and fall around midday on sunny days and at night. Strong wind and sun push cheaper renewable power into the market and lower prices.
- **Negative prices.** When renewable output is high and demand is low, some generators would rather pay than switch off (for example inflexible plants or those with fixed support payments), so prices can drop below zero, often on sunny weekend middays.
- **Dynamic tariffs.** Since 2025, German electricity suppliers must offer a dynamic tariff to customers with a smart meter. Its energy price follows the day-ahead price, so shifting use (EV charging, heat pumps, washing) to cheap hours can save money, though grid fees and taxes stay the same.
- **P10, P50, P90.** A P50 is the middle forecast: the real price should land above it about half the time. P10 and P90 bound a range the real price should fall inside about 80% of the time.
- **MAE.** Mean absolute error: the average size of a forecast's miss, in EUR/MWh. Lower is better.
