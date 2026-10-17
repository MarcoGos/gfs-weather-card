# GFS Weather Card

A custom Home Assistant Lovelace card that displays forecast data from the GFS Weather Forecast integration as a horizontally scrollable table.

## Install with HACS

1. Add this repository in HACS as a custom repository with the **Dashboard** category.
2. Download the card.
3. If HACS does not add the resource automatically, add `gfs-weather-card.js` as a JavaScript Module resource. Its URL is `/hacsfiles/<repository-name>/gfs-weather-card.js`.
4. Install and configure the GFS Weather Forecast integration with support for the `gfs_weather_forecast/get_forecast` WebSocket command.
5. Add **GFS Weather Card** to a dashboard. A single integration entry is selected automatically; choose an entry in the card editor if multiple entries are configured:

```yaml
type: custom:gfs-weather-card
```

## Visible rows

Use the card editor's **Visible rows** checklist to choose which forecast rows to show. All rows are shown by default. **Select all** explicitly selects every row; **Reset to defaults** removes the selection override. At least one row must remain selected.

The same selection can be configured in YAML:

```yaml
type: custom:gfs-weather-card
rows:
  - wind
  - gust
  - direction
  - temperature
  - rain
  - pressure
```

Available identifiers, in table order: `wind`, `gust`, `direction`, `temperature`, `upperTemperature`, `cloudHigh`, `cloudMid`, `cloudLow`, `cloudTotal`, `rain`, `cape`, `liftedIndex`, `pressure`, `visibility`.

Omit `rows` to show all rows. Empty lists, unknown identifiers, and duplicates are rejected. Rows always retain the standard table order, regardless of YAML order. Editor row labels follow Home Assistant's active language. Changing row visibility updates the card without requesting new forecast data.

## JSON format

The card requests the integration's cached JSON through Home Assistant's authenticated WebSocket connection using `gfs_weather_forecast/get_forecast`. When a specific entry is selected in the card editor, the card passes its `entry_id` with the request.

The response must contain an `info.date` value in `YYYY-MM-DD` format, a numeric `info.pass` (0, 6, 12, or 18 UTC), and forecast-hour properties whose values contain the weather fields used by the table. The header displays the actual run date and pass. Forecast hours are offsets from that run's start (`info.date` at `info.pass` UTC); the resulting times are displayed in the browser's local timezone. The browser no longer connects directly to the add-on, so no separate URL or CORS configuration is needed for the card.

The card requests the cached forecast every 10 minutes; the integration controls when the underlying data is updated. It converts wind speed to Beaufort, gusts from m/s to km/h, pressure from Pa to hPa above 1000, and visibility from meters to kilometers. The 2m temperature row uses `tmax`.

Cloud, rain, and CAPE values that round to zero are displayed as blank cells, retaining their background colors.

Row labels follow Home Assistant's active language. Dutch, English, and German are supported; other languages fall back to English.

Card surfaces, labels, and neutral table areas use Home Assistant theme colors and follow its active light or dark theme. The weather-data color scale remains the same in both modes.

## Tests

Run the regression tests with Node.js:

```sh
node --test tests/gfs-weather-card.test.cjs
```