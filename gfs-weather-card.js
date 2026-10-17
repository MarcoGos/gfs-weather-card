const CARD_NAME = 'gfs-weather-card';
const REFRESH_INTERVAL = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const LABELS = {
  de: {
    wind: 'Wind',
    gust: 'Windböen',
    direction: 'Windrichtung',
    temperature: 'Temperatur 2m',
    upperTemperature: 'Temperatur 500hPa',
    cloudHigh: 'Wolken hoch',
    cloudMid: 'Wolken mittel',
    cloudLow: 'Wolken tief',
    cloudTotal: 'Wolken gesamt',
    rain: 'Regen',
    cape: 'CAPE',
    liftedIndex: 'Lifted Index',
    pressure: 'Luftdruck',
    visibility: 'Sichtweite',
  },
  en: {
    wind: 'Wind',
    gust: 'Wind Gusts',
    direction: 'Wind Direction',
    temperature: 'Temperature 2m',
    upperTemperature: 'Temperature 500hPa',
    cloudHigh: 'Clouds High',
    cloudMid: 'Clouds Mid',
    cloudLow: 'Clouds Low',
    cloudTotal: 'Clouds Total',
    rain: 'Rain',
    cape: 'CAPE',
    liftedIndex: 'Lifted Index',
    pressure: 'Pressure',
    visibility: 'Visibility',
  },
  nl: {
    wind: 'Windkracht',
    gust: 'Windstoren',
    direction: 'Windrichting',
    temperature: 'Temperatuur 2m',
    upperTemperature: 'Temperatuur 500hPa',
    cloudHigh: 'Wolken hoog',
    cloudMid: 'Wolken midden',
    cloudLow: 'Wolken laag',
    cloudTotal: 'Wolken totaal',
    rain: 'Regen',
    cape: 'CAPE',
    liftedIndex: 'Lifted Index',
    pressure: 'Luchtdruk',
    visibility: 'Zicht',
  },
};

function resolveLanguage(language) {
  const baseLanguage = String(language || 'en').toLowerCase().split(/[-_]/, 1)[0];
  return Object.hasOwn(LABELS, baseLanguage) ? baseLanguage : 'en';
}

const ROWS = [
  { label: 'wind', unit: '(Bft)', kind: 'wind', value: (point) => beaufort(point.uwind, point.vwind), colorValue: (point) => Math.hypot(point.uwind, point.vwind) },
  { label: 'gust', unit: '(km/h)', kind: 'gust', value: (point) => rounded(point.gust * 3.6), colorValue: (point) => point.gust - 5 },
  { label: 'direction', kind: 'direction', value: (point) => windDirection(point.uwind, point.vwind) },
  { label: 'temperature', unit: '(°C)', kind: 'temperature', value: (point) => rounded(point.tmax) },
  { label: 'upperTemperature', unit: '(°C)', kind: 'upper-temperature', value: (point) => rounded(point.tmp500hpa) },
  { label: 'cloudHigh', unit: '(%)', kind: 'cloud', value: (point) => roundedOrBlank(point.cldhigh), colorValue: (point) => rounded(point.cldhigh) },
  { label: 'cloudMid', unit: '(%)', kind: 'cloud', value: (point) => roundedOrBlank(point.cldmid), colorValue: (point) => rounded(point.cldmid) },
  { label: 'cloudLow', unit: '(%)', kind: 'cloud', value: (point) => roundedOrBlank(point.cldlow), colorValue: (point) => rounded(point.cldlow) },
  { label: 'cloudTotal', unit: '(%)', kind: 'cloud', value: (point) => roundedOrBlank(point.cldtotal), colorValue: (point) => rounded(point.cldtotal) },
  { label: 'rain', unit: '(mm/3h)', kind: 'rain', value: (point) => roundedOrBlank(point.rain), colorValue: (point) => rounded(point.rain) },
  { label: 'cape', unit: '(J/kg)', kind: 'cape', value: (point) => roundedOrBlank(point.cape), colorValue: (point) => rounded(point.cape) },
  { label: 'liftedIndex', kind: 'lifted-index', value: (point) => rounded(point.liftedindex) },
  { label: 'pressure', unit: '+1000 (hPa)', kind: 'white', value: (point) => rounded(point.pres / 100) - 1000 },
  { label: 'visibility', unit: 'x1000 (m)', kind: 'visibility', value: (point) => rounded(point.vis / 1000) },
];

const CARD_STYLES = `
  :host {
    display: block;
    color: var(--primary-text-color, #202124);
  }
  ha-card {
    overflow: hidden;
    background: var(--ha-card-background, var(--card-background-color, #fff));
  }
  .scroller {
    overflow: auto;
    max-height: min(78vh, 900px);
    overscroll-behavior: contain;
    scrollbar-color: var(--secondary-text-color, #777) transparent;
  }
  table {
    border-collapse: collapse;
    border-spacing: 0;
    table-layout: auto;
    width: max-content;
    min-width: 100%;
    margin-bottom: 0;
    color: #212529;
    font-family: -apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    font-size: 10px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  th, td {
    box-sizing: border-box;
    padding: 0.3rem;
    border-top: 1px solid #dee2e6;
    text-align: center;
    white-space: nowrap;
    vertical-align: top;
  }
  thead th {
    position: sticky;
    z-index: 2;
    background: transparent;
    font-weight: 400;
  }
  thead tr:first-child th { top: 0; }
  thead tr:last-child th { top: 36px; }
  .corner {
    left: 0;
    z-index: 5;
    padding: 0.3rem;
    white-space: normal;
    background: #eee;
  }
  .corner strong, .corner span { display: block; }
  .corner strong { margin-bottom: 5px; font-size: 16px; }
  .corner span { line-height: 1.45; }
  .day-heading { text-transform: lowercase; }
  .time-heading {
  }
  .row-label {
    position: sticky;
    left: 0;
    z-index: 1;
    background: #eee;
    font-weight: 400;
    text-align: center;
  }
  .time-heading, tbody td { min-width: 29.6px; }
  .forecast-table .odd { background-color: #bbb; }
  .forecast-table .even { background-color: #eee; }
  .direction { padding: 0.3rem; background-color: #fff; font-size: 16px; line-height: 1.5; }
  .status {
    padding: 20px 16px;
    color: var(--secondary-text-color, #666);
    text-align: center;
  }
  .error { color: var(--error-color, #b3261e); }
  @media (prefers-color-scheme: dark) {
    .forecast-table { color: #000 !important; }
    .forecast-table .row-label { color: #fff !important; background-color: transparent; }
    .forecast-table thead { color: #fff !important; }
    .forecast-table .direction { background-color: #fff !important; color: #000; }
    .forecast-table .odd { background-color: #bbb; }
    .forecast-table .even { background-color: #222; }
  }
  @media (max-width: 600px) {
    thead tr:last-child th { top: 32px; }
    .row-label { position: static; }
    .corner { left: auto; }
  }
`;

function rounded(value) {
  return Number.isFinite(value) ? roundTiesToEven(value) : null;
}

function roundTiesToEven(value) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function roundedOrBlank(value) {
  const result = rounded(value);
  return result === 0 ? '' : result;
}

function beaufort(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const speed = Math.hypot(u, v);
  const thresholds = [0.2, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  return thresholds.filter((threshold) => speed >= threshold).length;
}

function windDirection(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  if (Math.hypot(u, v) < 0.1) return { calm: true, angle: 0 };
  return { calm: false, angle: -Math.atan2(u, -v) * 180 / Math.PI };
}

function strRgb(red, green, blue) {
  const channels = [red, green, blue].map((channel) =>
    Math.max(0, Math.min(255, roundTiesToEven(channel))),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function getRgbWind(speed) {
  let knots = speed / 0.5144;
  if (knots < 0 || knots <= 5) return '#ffffff';
  if (knots <= 8.9) {
    return strRgb(255 + ((knots - 5) / 3.9) * -152, 255 + ((knots - 5) / 3.9) * -8, 255 + ((knots - 5) / 3.9) * -14);
  }
  if (knots <= 13.5) {
    return strRgb(103 + ((knots - 8.9) / 4.6) * -103, 247 + ((knots - 8.9) / 4.6) * 8, 241 + ((knots - 8.9) / 4.6) * -241);
  }
  if (knots <= 18.8) {
    return strRgb(((knots - 13.5) / 5.3) * 255, 255 + ((knots - 13.5) / 5.3) * -15, 0);
  }
  if (knots <= 24.7) {
    return strRgb(255, 240 + ((knots - 18.8) / 5.9) * -190, ((knots - 18.8) / 5.9) * 44);
  }
  if (knots <= 31.7) {
    return strRgb(255, 50 + ((knots - 24.7) / 7) * -40, 44 + ((knots - 24.7) / 7) * 156);
  }
  if (knots <= 38) {
    return strRgb(255, 10 + ((knots - 31.7) / 6.3) * -10, 200 + ((knots - 31.7) / 6.3) * 55);
  }
  if (knots <= 45) {
    return strRgb(255 + ((knots - 38) / 7) * -105, ((knots - 38) / 7) * 50, 255);
  }
  if (knots <= 60) {
    return strRgb(150 + ((knots - 45) / 15) * -90, 50 + ((knots - 45) / 15) * 10, 255);
  }
  return strRgb(60, 60, 255);
}

function getRgbTemperature(value) {
  if (value < -25) return strRgb(80, 255, 220);
  if (value <= -15) {
    return strRgb(80 + ((value + 25) / 10) * 91, 255 + ((value + 25) / 10) * -65, 220 + ((value + 25) / 10) * 35);
  }
  if (value <= 0) {
    return strRgb(171 + ((value + 15) / 15) * 84, 190 + ((value + 15) / 15) * 65, 255);
  }
  if (value <= 10) return strRgb(255, 255, 255 + (value / 10) * -155);
  if (value <= 20) return strRgb(255, 255 + ((value - 10) / 10) * -85, 100 + ((value - 10) / 10) * -100);
  if (value <= 30) return strRgb(255, 170 + ((value - 20) / 10) * -120, ((value - 20) / 10) * 50);
  if (value <= 35) return strRgb(255, 50 + ((value - 30) / 5) * -50, 50 + ((value - 30) / 5) * 60);
  if (value <= 40) return strRgb(255, 0, 110 + ((value - 35) / 5) * 50);
  return strRgb(255, 0, 160);
}

function getRgbCloud(value) {
  if (value < 0) return strRgb(255, 255, 255);
  if (value <= 100) {
    const channel = 255 + (value / 100) * -120;
    return strRgb(channel, channel, channel);
  }
  return strRgb(135, 135, 135);
}

function getRgbPrecipitation(value) {
  if (value < 0) return strRgb(255, 255, 255);
  if (value <= 3) return strRgb(255 + (value / 3) * -140, 255 + (value / 3) * -140, 255);
  return strRgb(115, 115, 255);
}

function getRgbCape(value) {
  if (value === 0) return strRgb(255, 255, 255);
  if (value < 3500) {
    const channel = 255 + (value / 3500) * -255;
    return strRgb(255, channel, channel);
  }
  return strRgb(255, 0, 0);
}

function getRgbLiftedIndex(value) {
  if (value >= 0) return strRgb(255, 255, 255);
  if (value > -6) {
    const channel = 255 + (value / -5) * -255;
    return strRgb(255, channel, channel);
  }
  return strRgb(255, 0, 0);
}

function getRgbVisibility(value) {
  const clampedValue = Math.min(value, 24);
  const channel = ((24 - clampedValue) / 24) * 255;
  return strRgb(channel, channel, channel);
}

function colorFor(kind, value) {
  if (!Number.isFinite(value)) return '';
  if (kind === 'wind' || kind === 'gust') return getRgbWind(value);
  if (kind === 'temperature' || kind === 'upper-temperature') return getRgbTemperature(value);
  if (kind === 'cloud') return getRgbCloud(value);
  if (kind === 'rain') return getRgbPrecipitation(value);
  if (kind === 'cape') return getRgbCape(value);
  if (kind === 'lifted-index') return getRgbLiftedIndex(value);
  if (kind === 'visibility') return getRgbVisibility(value);
  if (kind === 'white') return '#ffffff';
  return '';
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayParityClass(date) {
  const currentDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const firstDay = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((currentDay - firstDay) / 86400000);
  return dayOfYear % 2 === 1 ? 'odd' : 'even';
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat('nl-NL', options).format(date).replaceAll('.', '');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class GfsWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._error = '';
    this._loading = false;
    this._language = 'en';
    this._hass = null;
    this._requestId = 0;
    this._refreshTimer = null;
  }

  get hass() {
    return this._hass;
  }

  set hass(hass) {
    const wasAvailable = Boolean(this._hass);
    this._hass = hass;
    const language = resolveLanguage(hass?.locale?.language ?? hass?.language);
    if (language !== this._language) {
      this._language = language;
      if (this._data) this._render();
    }
    if (!wasAvailable && hass && this.isConnected) this._load();
  }

  setConfig(config) {
    if (!isRecord(config)) throw new Error('Card configuration must be an object');
    const entryChanged = this._config?.entry_id !== config.entry_id;
    this._config = { ...config };
    if (this.isConnected && entryChanged) {
      this._requestId += 1;
      this._loading = false;
      this._load();
    }
    else this._render();
  }

  connectedCallback() {
    this._load();
    this._refreshTimer = window.setInterval(() => this._load(), REFRESH_INTERVAL);
  }

  disconnectedCallback() {
    window.clearInterval(this._refreshTimer);
    this._requestId += 1;
    this._loading = false;
  }

  getCardSize() {
    return 8;
  }

  static getConfigElement() {
    return document.createElement('gfs-weather-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  async _load() {
    if (!this.hass) {
      this._error = 'Wachten op Home Assistant…';
      this._render();
      return;
    }
    if (this._loading) return;

    const requestId = ++this._requestId;
    this._loading = true;
    this._error = '';
    this._render();

    try {
      const command = {
        type: 'gfs_weather_forecast/get_forecast',
      };
      if (this._config?.entry_id) command.entry_id = this._config.entry_id;
      const json = await this.hass.callWS(command);
      if (requestId !== this._requestId) return;
      if (!isRecord(json) || !isRecord(json.info) || !/^\d{4}-\d{2}-\d{2}$/.test(json.info.date)) {
        throw new Error('Invalid forecast data');
      }

      const points = Object.entries(json)
        .filter(([key, value]) => /^\d+$/.test(key) && isRecord(value) && value.done !== false)
        .map(([key, value]) => ({ hour: Number(key), point: value }))
        .filter(({ hour }) => Number.isSafeInteger(hour))
        .sort((left, right) => left.hour - right.hour);
      if (points.length === 0) throw new Error('No forecast hours found');

      this._data = { info: json.info, points };
      this._error = '';
    } catch (error) {
      if (requestId !== this._requestId) return;
      this._data = null;
      this._error = 'Kan de voorspelling niet ophalen. Controleer of de GFS Weather Forecast-integratie is geladen en voorspellingen beschikbaar zijn.';
    } finally {
      if (requestId === this._requestId) {
        this._loading = false;
        this._render();
      }
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    if (this._data) {
      this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style><ha-card><div class="scroller" tabindex="0" aria-label="GFS weersverwachting">${this._tableMarkup()}</div></ha-card>`;
      return;
    }

    const message = this._loading ? 'Verwachting laden…' : this._error;
    const errorClass = this._loading ? '' : ' error';
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style><ha-card><div class="status${errorClass}" role="status">${message}</div></ha-card>`;
  }

  _tableMarkup() {
    const { info, points } = this._data;
    const [year, month, day] = info.date.split('-').map(Number);
    const runDate = new Date(Date.UTC(year, month - 1, day));
    const columns = points.map(({ hour, point }) => ({
      hour,
      point,
      date: new Date(runDate.getTime() + hour * HOUR_MS),
    }));
    const dateHeadings = columns.map((column) => {
      const weekday = formatDate(column.date, { weekday: 'short' });
      const day = formatDate(column.date, { day: 'numeric' });
      const month = formatDate(column.date, { month: 'short' });
      return `<th class="day-heading ${dayParityClass(column.date)}" scope="col">${weekday}<br>${day}<br>${month}</th>`;
    }).join('');
    const timeHeadings = columns.map((column, index) => {
      const startsDay = index === 0 || localDateKey(column.date) !== localDateKey(columns[index - 1].date);
      return `<th class="time-heading ${dayParityClass(column.date)}${startsDay ? ' day-start' : ''}" scope="col">${String(column.date.getHours()).padStart(2, '0')}h</th>`;
    }).join('');
    const rowLabels = LABELS[this._language] ?? LABELS.en;
    const rows = ROWS.map((row) => {
      const cells = columns.map((column, index) => {
        const value = row.value(column.point);
        const colorValue = row.colorValue ? row.colorValue(column.point) : value;
        const startsDay = index === 0 || localDateKey(column.date) !== localDateKey(columns[index - 1].date);
        const className = [dayParityClass(column.date), row.kind === 'direction' ? 'direction' : '', startsDay ? 'day-start' : ''].filter(Boolean).join(' ');
        const background = row.kind === 'direction' || row.kind === 'visibility'
          ? '#ffffff'
          : colorFor(row.kind, colorValue);
        const foreground = row.kind === 'visibility' ? colorFor(row.kind, colorValue) : '';
        const styles = [];
        if (background) styles.push(`background-color:${background}`);
        if (foreground) styles.push(`color:${foreground}`);
        const style = styles.length ? ` style="${styles.join(';')}"` : '';
        let content = value === null ? '–' : value;
        if (row.kind === 'direction' && value) {
          content = value.calm
            ? '<span aria-label="Windstil">·</span>'
            : `<span aria-label="Windrichting" style="display:inline-block;transform:rotate(${value.angle}deg)">↓</span>`;
        }
        return `<td class="${className}"${style}>${content}</td>`;
      }).join('');
      const label = rowLabels[row.label] ?? LABELS.en[row.label] ?? row.label;
      return `<tr><th class="row-label" scope="row">${label}${row.unit ? ` ${row.unit}` : ''}</th>${cells}</tr>`;
    }).join('');

    const runDateLabel = new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(runDate).replaceAll('.', '');
    return `<table class="forecast-table"><thead><tr><th class="corner" rowspan="2"><strong>GFS</strong><span>${runDateLabel}</span><span>00 UTC</span></th>${dateHeadings}</tr><tr>${timeHeadings}</tr></thead><tbody>${rows}</tbody></table>`;
  }
}

class GfsWeatherCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._entries = [];
    this._entryError = '';
    this._loadingEntries = false;
    this._hass = null;
    this._entryRequestId = 0;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._loadEntries();
  }

  async _loadEntries() {
    if (!this._hass?.callWS || this._loadingEntries) return;
    const requestId = ++this._entryRequestId;
    this._loadingEntries = true;
    this._entryError = '';
    this._render();
    try {
      const response = await this._hass.callWS({ type: 'config_entries/get' });
      if (requestId !== this._entryRequestId) return;
      const entries = Array.isArray(response) ? response : response.entries ?? [];
      this._entries = entries.filter((entry) => entry.domain === 'gfs_weather_forecast');
    } catch {
      if (requestId !== this._entryRequestId) return;
      this._entries = [];
      this._entryError = 'Could not load GFS integration entries.';
    } finally {
      if (requestId === this._entryRequestId) {
        this._loadingEntries = false;
        this._render();
      }
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: var(--primary-text-color, #202124); }
        label { display: block; margin-bottom: 8px; font-size: 14px; }
        select { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--input-border-color, #888); border-radius: 4px; background: var(--input-fill-color, transparent); color: inherit; font: inherit; }
        p { margin: 8px 0 0; color: var(--secondary-text-color, #666); font-size: 12px; }
      </style>
      <label for="entry">GFS Weather Forecast entry</label>
      <select id="entry"></select>
      <p id="status" role="status"></p>
    `;

    const select = this.shadowRoot.querySelector('select');
    select.add(new Option(this._loadingEntries ? 'Loading entries…' : 'Automatic (single entry)', ''));
    for (const entry of this._entries) {
      const title = entry.title || 'GFS Weather Forecast';
      const suffix = this._entries.length > 1 ? ` (${entry.entry_id.slice(0, 8)})` : '';
      select.add(new Option(`${title}${suffix}`, entry.entry_id));
    }
    select.value = this._config.entry_id ?? '';
    select.addEventListener('change', () => {
      const config = { ...this._config };
      if (select.value) config.entry_id = select.value;
      else delete config.entry_id;
      this._config = config;
      this.dispatchEvent(new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config },
      }));
    });

    this.shadowRoot.querySelector('#status').textContent = this._entryError ||
      (this._entries.length === 0 && !this._loadingEntries ? 'No GFS integration entries found.' : '');
  }
}

if (!customElements.get(CARD_NAME)) customElements.define(CARD_NAME, GfsWeatherCard);
if (!customElements.get('gfs-weather-card-editor')) customElements.define('gfs-weather-card-editor', GfsWeatherCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: CARD_NAME,
  name: 'GFS Weather Card',
  description: 'GFS forecast table from the GFS Weather Forecast integration',
});