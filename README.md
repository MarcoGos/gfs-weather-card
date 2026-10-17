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

## JSON format

The card requests the integration's cached JSON through Home Assistant's authenticated WebSocket connection using `gfs_weather_forecast/get_forecast`. When a specific entry is selected in the card editor, the card passes its `entry_id` with the request.

The response must contain an `info.date` value in `YYYY-MM-DD` format and forecast-hour properties whose values contain the weather fields used by the table. Forecast hours are added to midnight UTC on `info.date`; the resulting times are displayed in the browser's local timezone. The browser no longer connects directly to the add-on, so no separate URL or CORS configuration is needed for the card.

The card requests the cached forecast every 10 minutes; the integration controls when the underlying data is updated. It converts wind speed to Beaufort, gusts from m/s to km/h, pressure from Pa to hPa above 1000, and visibility from meters to kilometers. The 2m temperature row uses `tmax`.

Cloud, rain, and CAPE values that round to zero are displayed as blank cells, retaining their background colors.

Row labels follow Home Assistant's active language. Dutch, English, and German are supported; other languages fall back to English.