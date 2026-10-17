const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { setImmediate } = require('node:timers/promises');
const { runInNewContext } = require('node:vm');

const source = readFileSync(`${__dirname}/../gfs-weather-card.js`, 'utf8');

function setup() {
  const elements = new Map();
  const timers = new Map();
  let timerId = 0;
  class HTMLElement {
    isConnected = true;
    attachShadow() {
      this.shadowRoot = { innerHTML: '' };
    }
  }
  runInNewContext(source, {
    HTMLElement,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        Object.assign(this, options);
      }
    },
    Intl,
    Date,
    customElements: {
      get: (name) => elements.get(name),
      define: (name, element) => elements.set(name, element),
    },
    window: {
      setInterval: (callback, delay) => {
        timers.set(++timerId, { callback, delay });
        return timerId;
      },
      clearInterval: (id) => timers.delete(id),
    },
  });
  const Card = elements.get('gfs-weather-card');
  const card = new Card();
  card.setConfig({});
  return { card, timers, Editor: elements.get('gfs-weather-card-editor') };
}

function forecast(pass, hours = [0, 3]) {
  return {
    info: { date: '2026-10-17', pass },
    ...Object.fromEntries(hours.map((hour) => [hour, {
      done: true,
      uwind: 1, vwind: 2, gust: 3, tmax: 15, tmp500hpa: -20,
      cldhigh: 0, cldmid: 0, cldlow: 0, cldtotal: 0,
      rain: 0, cape: 0, liftedindex: 1, pres: 101000, vis: 10000,
    }])),
  };
}

async function load(card, json) {
  card._hass = { callWS: async () => json };
  await card._load();
}

function headingHours(card) {
  return [...card.shadowRoot.innerHTML.matchAll(/class="time-heading[^"]*" scope="col">(\d+)h/g)]
    .map((match) => Number(match[1]));
}

test('uses Home Assistant theme colors for neutral surfaces and text', async () => {
  const { card } = setup();
  await load(card, forecast(6));
  assert.match(card.shadowRoot.innerHTML, /color: var\(--primary-text-color/);
  assert.match(card.shadowRoot.innerHTML, /background-color: var\(--gfs-muted-background\)/);
  assert.match(card.shadowRoot.innerHTML, /--gfs-card-background: var\(--ha-card-background/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /prefers-color-scheme/);
});

test('row selection filters in standard order without requesting new data', async () => {
  const { card } = setup();
  let requests = 0;
  card._hass = { callWS: async () => {
    requests += 1;
    return forecast(6);
  } };
  await card._load();
  assert.equal((card._tableMarkup().match(/class="row-label"/g) || []).length, 14);
  card.setConfig({ rows: ['pressure', 'wind', 'rain'] });
  const labels = [...card._tableMarkup().matchAll(/class="row-label" scope="row">([^<]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(labels, ['Wind (Bft)', 'Rain (mm/3h)', 'Pressure +1000 (hPa)']);
  assert.equal(requests, 1);
  card.setConfig({});
  assert.equal((card._tableMarkup().match(/class="row-label"/g) || []).length, 14);
  assert.equal(requests, 1);
});

test('card and editor reject invalid row selections without replacing valid config', () => {
  const { card, Editor } = setup();
  const editor = new Editor();
  editor._render = () => {};
  for (const target of [card, editor]) {
    target.setConfig({ rows: ['wind'] });
    for (const rows of [[], null, 'wind', ['unknown'], [1], ['wind', 'wind']]) {
      assert.throws(() => target.setConfig({ rows }), /rows|row identifier/);
      assert.deepEqual(Array.from(target._config.rows), ['wind']);
    }
  }
});

test('card copies the row selection and retains localized row labels', async () => {
  const { card } = setup();
  const rows = ['temperature'];
  card.setConfig({ rows });
  rows.push('wind');
  await load(card, forecast(6));
  card.hass = { locale: { language: 'de' } };
  assert.equal((card._tableMarkup().match(/class="row-label"/g) || []).length, 1);
  assert.match(card._tableMarkup(), />Temperatur 2m \(°C\)<\/th>/);
});

test('date headings use the full Home Assistant locale', async () => {
  const { card } = setup();
  await load(card, forecast(6));
  card.hass = { locale: { language: 'en-US' } };
  const date = new Date(Date.UTC(2026, 9, 17, 6));
  const expectedHeading = [
    new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
    new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(date),
    new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
  ].join(' ');
  assert.ok(card._tableMarkup().includes(`<span>${expectedHeading}</span>`));
  const expectedRunDate = new Intl.DateTimeFormat('en-US', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
  assert.ok(card._tableMarkup().includes(`<span>${expectedRunDate} (06)</span>`));
});

test('editor config updates preserve other options and emit independent config copies', () => {
  const { Editor } = setup();
  const editor = new Editor();
  editor._render = () => {};
  const events = [];
  editor.dispatchEvent = (event) => events.push(event);
  editor.setConfig({ type: 'custom:gfs-weather-card', entry_id: 'selected', rows: ['wind'] });
  editor._updateConfig({ ...editor._config, rows: ['wind', 'rain'] });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'config-changed');
  assert.equal(events[0].bubbles, true);
  assert.equal(events[0].composed, true);
  assert.equal(events[0].detail.config.entry_id, 'selected');
  assert.equal(events[0].detail.config.type, 'custom:gfs-weather-card');
  events[0].detail.config.rows.push('pressure');
  assert.deepEqual(Array.from(editor._config.rows), ['wind', 'rain']);
});

test('editor caches entries across Home Assistant updates, including empty lists', async () => {
  for (const entries of [[], [{ domain: 'gfs_weather_forecast', entry_id: 'single' }]]) {
    const { Editor } = setup();
    const editor = new Editor();
    let renders = 0;
    let requests = 0;
    editor._render = () => { renders += 1; };
    const connection = {};
    const callWS = async () => {
      requests += 1;
      return entries;
    };
    editor.hass = { connection, callWS };
    editor.hass = { connection, callWS };
    await setImmediate();
    const initialRenders = renders;
    for (let i = 0; i < 10; i += 1) editor.hass = { connection, callWS };
    await setImmediate();
    assert.equal(requests, 1);
    assert.equal(renders, initialRenders);
    editor.hass = { connection, callWS, language: 'de' };
    assert.equal(renders, initialRenders + 1);
    assert.equal(requests, 1);
    editor.hass = { connection: {}, callWS };
    await setImmediate();
    assert.equal(requests, 2);
  }
});

test('failed editor entry requests remain visible without automatic retry loops', async () => {
  const { Editor } = setup();
  const editor = new Editor();
  editor._render = () => {};
  let requests = 0;
  const callWS = async () => {
    requests += 1;
    throw new Error('Disconnected');
  };
  editor.hass = { callWS };
  await setImmediate();
  editor.hass = { callWS };
  await setImmediate();
  assert.equal(requests, 1);
  assert.equal(editor._entryError, 'Could not load GFS integration entries.');
  editor._entryError = '';
  await editor._loadEntries();
  assert.equal(requests, 2);
});

test('editor ignores an entry response from a replaced connection', async () => {
  const { Editor } = setup();
  const editor = new Editor();
  editor._render = () => {};
  let finishOldRequest;
  editor.hass = { connection: {}, callWS: () => new Promise((resolve) => {
    finishOldRequest = resolve;
  }) };
  editor.hass = { connection: {}, callWS: async () => [
    { domain: 'gfs_weather_forecast', entry_id: 'new' },
  ] };
  await setImmediate();
  finishOldRequest([{ domain: 'gfs_weather_forecast', entry_id: 'old' }]);
  await setImmediate();
  assert.equal(editor._entries[0].entry_id, 'new');
  assert.equal(editor._entriesLoaded, true);
});

test('day boundaries align across headings and all forecast rows', async () => {
  const { card } = setup();
  const hours = [0, 3, 9, 18, 24, 36, 48];
  await load(card, forecast(6, hours));
  const starts = hours.map((hour, index) => index === 0 ||
    new Date(Date.UTC(2026, 9, 17, 6 + hour)).toDateString() !==
    new Date(Date.UTC(2026, 9, 17, 6 + hours[index - 1])).toDateString());
  const markup = card._tableMarkup();
  const headings = [...markup.matchAll(/class="time-heading([^"]*)"/g)];
  assert.deepEqual(headings.map((match) => match[1].includes('day-start')), starts);
  for (const row of markup.split('<tbody>')[1].split('<tr>').slice(1)) {
    const cells = [...row.matchAll(/<td class="([^"]*)"/g)];
    assert.deepEqual(cells.map((match) => match[1].includes('day-start')), starts);
  }
  assert.equal([...markup.matchAll(/class="day-heading /g)].length, starts.filter(Boolean).length);
  assert.match(card.shadowRoot.innerHTML,
    /\.day-heading \+ \.day-heading, \.day-start:not\(:first-of-type\) \{\s*border-left: 2px solid var\(--secondary-text-color, #777\)/);
});

test('wind direction cells use alternating day backgrounds', async () => {
  const { card } = setup();
  await load(card, forecast(6, [0, 24, 48]));
  assert.doesNotMatch(card.shadowRoot.innerHTML,
    /\.forecast-table td\.direction \{[^}]*background-color: var\(--gfs-card-background\)/);
  assert.match(card.shadowRoot.innerHTML, /\.forecast-table \.odd \{ background-color: var\(--gfs-muted-background\); \}/);
  assert.match(card.shadowRoot.innerHTML, /\.forecast-table \.even \{ background-color: var\(--gfs-card-background\); \}/);
  const cells = [...card._tableMarkup().matchAll(/<td class="[^"]*\bdirection\b[^"]*"([^>]*)>/g)];
  assert.equal(cells.length, 3);
  assert.ok(cells.every((match) => !match[1].includes('style=')));
  assert.ok(cells.every((match) => /\b(?:odd|even)\b/.test(match[0])));
});

for (const pass of [0, 6, 12, 18]) {
  test(`renders pass ${pass} and forecast times relative to the run`, async () => {
    const { card } = setup();
    await load(card, forecast(pass));
    assert.match(card.shadowRoot.innerHTML, new RegExp(`<span>17 okt 2026 \\(${String(pass).padStart(2, '0')}\\)</span>`));
    assert.deepEqual(headingHours(card), [0, 3].map((hour) =>
      new Date(Date.UTC(2026, 9, 17, pass + hour)).getHours()));
  });
}

test('forecast offsets cross midnight without changing the run date', async () => {
  const { card } = setup();
  await load(card, forecast(18, [6, 9]));
  assert.match(card.shadowRoot.innerHTML, /<span>17 okt 2026 \(18\)<\/span>/);
  assert.deepEqual(headingHours(card), [6, 9].map((hour) =>
    new Date(Date.UTC(2026, 9, 17, 18 + hour)).getHours()));
  const day = new Intl.DateTimeFormat('nl-NL', { day: 'numeric' })
    .format(new Date(Date.UTC(2026, 9, 18)));
  assert.match(card.shadowRoot.innerHTML, new RegExp(`<span>${formatWeekday(new Date(Date.UTC(2026, 9, 18)))} ${day} okt</span></th>`));
});

function formatWeekday(date) {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short' }).format(date).replaceAll('.', '');
}

test('one date heading spans all forecast columns on the same local day', async () => {
  const { card } = setup();
  const hours = [0, 1, 2];
  await load(card, forecast(6, hours));
  const headings = [...card.shadowRoot.innerHTML.matchAll(/class="day-heading[^"]*" scope="colgroup" colspan="(\d+)"><span>([^<]+)<\/span><\/th>/g)];
  assert.equal(headings.length, 1);
  assert.equal(Number(headings[0][1]), hours.length);
  const date = new Date(Date.UTC(2026, 9, 17, 6));
  const day = new Intl.DateTimeFormat('nl-NL', { day: 'numeric' }).format(date);
  assert.equal(headings[0][2], `${formatWeekday(date)} ${day} okt`);
  assert.equal(headingHours(card).length, hours.length);
});

test('date headings span only available hours and split at local midnight', async () => {
  const { card } = setup();
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 48];
  await load(card, forecast(6, hours));
  const expected = [];
  for (const hour of hours) {
    const date = new Date(Date.UTC(2026, 9, 17, 6 + hour));
    const label = `${formatWeekday(date)} ${date.getDate()} okt`;
    const previous = expected[expected.length - 1];
    if (previous?.label === label) previous.count += 1;
    else expected.push({ label, count: 1 });
  }
  const actual = [...card.shadowRoot.innerHTML.matchAll(/class="day-heading[^"]*" scope="colgroup" colspan="(\d+)"><span>([^<]+)<\/span><\/th>/g)]
    .map((match) => ({ label: match[2], count: Number(match[1]) }));
  assert.deepEqual(actual, expected);
  assert.equal(actual.reduce((sum, group) => sum + group.count, 0), hours.length);
  assert.equal(headingHours(card).length, hours.length);
});

test('ten-minute polling replaces pass 0 with pass 6 from the integration cache', async () => {
  const { card, timers } = setup();
  let latest = forecast(0);
  const commands = [];
  card._hass = { callWS: async (command) => {
    commands.push(command);
    return latest;
  } };
  card.connectedCallback();
  await setImmediate();
  assert.match(card.shadowRoot.innerHTML, /<span>17 okt 2026 \(00\)<\/span>/);
  assert.equal(timers.size, 1);
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 10 * 60 * 1000);
  latest = forecast(6);
  timer.callback();
  await setImmediate();
  assert.match(card.shadowRoot.innerHTML, /<span>17 okt 2026 \(06\)<\/span>/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<span>17 okt 2026 \(00\)<\/span>/);
  assert.deepEqual(commands.map((command) => command.type),
    ['gfs_weather_forecast/get_forecast', 'gfs_weather_forecast/get_forecast']);
  card.disconnectedCallback();
  assert.equal(timers.size, 0);
});

test('selected integration entry is preserved in forecast requests', async () => {
  const { card } = setup();
  card.setConfig({ entry_id: 'selected-entry' });
  let command;
  card._hass = { callWS: async (value) => {
    command = value;
    return forecast(6);
  } };
  await card._load();
  assert.equal(command.entry_id, 'selected-entry');
});

for (const pass of [undefined, null, '6', -6, 24]) {
  test(`invalid pass ${String(pass)} displays the forecast error`, async () => {
    const { card } = setup();
    await load(card, forecast(pass));
    assert.equal(card._data, null);
    assert.match(card.shadowRoot.innerHTML, /class="status error"/);
    assert.match(card.shadowRoot.innerHTML, /Unable to fetch the forecast/);
  });
}
