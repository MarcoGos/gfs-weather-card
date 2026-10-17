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
  return { card, timers };
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
    assert.match(card.shadowRoot.innerHTML, /Kan de voorspelling niet ophalen/);
  });
}
