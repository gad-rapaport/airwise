/*
 * Airwise product film (20 s, 1920x1080). Geometric motion language: data as moving shapes.
 * Story: a runner wonders whether the air is good -> ten cities, one provider request, validation, storage ->
 * the chart builds from the real bundled snapshot -> the provider fails and saved data stays labelled ->
 * the runner goes out. The chart lines are drawn from data/snapshot/open-meteo-air-quality.json.
 */
const { ease, prog, tw, life, rand, wave, h, place, createStage, attachPlayer } = Motion;

const C = {
  mist: '#f4f7f8',
  sky: '#dfeef0',
  navy: '#102a33',
  navy2: '#173a46',
  teal: '#0d6b73',
  tealSoft: '#e2f1f2',
  ink: '#102a33',
  muted: '#4d6570',
  line: '#d3dee2',
  white: '#ffffff',
  amber: '#8a5a00',
  amberSoft: '#fff6e0',
  bad: '#9b2c2c',
  series: ['#0a62a6', '#c4510a', '#0b7a5c', '#9b3f86'],
  skin: '#b97a55',
};
const DUR = 20;
const svg = document.getElementById('stage');

const CITIES = [
  ['tel-aviv', 'Tel Aviv-Yafo', 32.09, 34.78],
  ['jerusalem', 'Jerusalem', 31.77, 35.21],
  ['haifa', 'Haifa', 32.79, 34.99],
  ['beer-sheva', "Be'er Sheva", 31.25, 34.79],
  ['eilat', 'Eilat', 29.56, 34.95],
  ['tiberias', 'Tiberias', 32.8, 35.53],
  ['athens', 'Athens', 37.98, 23.73],
  ['nicosia', 'Nicosia', 35.19, 33.38],
  ['cairo', 'Cairo', 30.04, 31.24],
  ['istanbul', 'Istanbul', 41.01, 28.98],
];
const COMPARED = ['tel-aviv', 'jerusalem', 'haifa', 'athens'];

fetch('../data/snapshot/open-meteo-air-quality.json')
  .then((r) => r.json())
  .then(build);

function build(snapshot) {
  const stage = createStage({ duration: DUR, root: svg });
  const ids = snapshot.location_ids;
  const captured = snapshot.captured_at_unix;
  // Last 72 hours before capture plus the forecast after it, PM2.5, for the four compared cities.
  const seriesFor = (id) => {
    const hourly = snapshot.response[ids.indexOf(id)].hourly;
    return hourly.time.map((tsec, i) => [tsec, hourly.pm2_5[i]]).filter(([tsec]) => tsec >= captured - 72 * 3600);
  };
  const data = COMPARED.map(seriesFor);
  const tMin = data[0][0][0];
  const tMax = data[0][data[0].length - 1][0];
  const yMax = 20;
  const aqiIndex = snapshot.response[ids.indexOf('tel-aviv')].hourly;
  let latestAqi = null;
  aqiIndex.time.forEach((tsec, i) => {
    if (tsec <= captured && aqiIndex.european_aqi[i] !== null) latestAqi = aqiIndex.european_aqi[i];
  });
  const band = latestAqi <= 20 ? 'Good' : latestAqi <= 40 ? 'Fair' : latestAqi <= 60 ? 'Moderate' : latestAqi <= 80 ? 'Poor' : 'Very poor';

  // ---------- backgrounds ----------
  svg.appendChild(
    h('defs', {}, [
      h('linearGradient', { id: 'skyGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, [
        h('stop', { offset: 0, 'stop-color': '#cfe3e6' }),
        h('stop', { offset: 1, 'stop-color': C.mist }),
      ]),
      h('clipPath', { id: 'phoneClip' }, [h('rect', { x: -70, y: -140, width: 140, height: 280, rx: 18 })]),
      h('clipPath', { id: 'chartClip' }, [h('rect', { x: 0, y: -20, width: 1100, height: 460 })]),
    ]),
  );
  const city = h('g');
  svg.appendChild(city);
  city.appendChild(h('rect', { width: 1920, height: 1080, fill: 'url(#skyGrad)' }));
  const sun = h('circle', { cx: 1500, cy: 260, r: 90, fill: '#f1d9a8' });
  city.appendChild(sun);
  const skyline = h('g');
  city.appendChild(skyline);
  const towers = [];
  for (let i = 0; i < 22; i++) {
    const w = 60 + rand(i) * 70;
    const hgt = 160 + rand(i + 40) * 300;
    const x = i * 90 - 20;
    const rect = h('rect', { x, y: 880 - hgt, width: w, height: hgt, fill: i % 3 === 0 ? '#c8dade' : '#dbe7ea', stroke: C.navy, 'stroke-width': 2 });
    skyline.appendChild(rect);
    towers.push({ rect, hgt, delay: rand(i + 3) * 0.6 });
  }
  city.appendChild(h('rect', { x: 0, y: 880, width: 1920, height: 200, fill: '#e6eef0' }));
  city.appendChild(h('line', { x1: 0, y1: 880, x2: 1920, y2: 880, stroke: C.navy, 'stroke-width': 3 }));
  const haze = h('g');
  city.appendChild(haze);
  for (let i = 0; i < 70; i++) haze.appendChild(h('circle', { r: 3 + rand(i) * 9, fill: '#9aa9af' }));

  // ---------- geometric runner ----------
  const runner = h('g');
  city.appendChild(runner);
  const limb = (color, width) => h('path', { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const legB = limb('#0c2d36', 30);
  const armB = limb(C.skin, 22);
  const torso = h('rect', { x: -38, y: -330, width: 76, height: 150, rx: 36, fill: C.teal });
  const shorts = h('rect', { x: -40, y: -200, width: 80, height: 50, rx: 14, fill: '#0c2d36' });
  const head = h('circle', { cx: 0, cy: -380, r: 40, fill: C.skin });
  const hair = h('path', { d: 'M-40 -384 A40 40 0 0 1 40 -384 L40 -396 Q0 -440 -40 -396 Z', fill: '#24130c' });
  const legF = limb('#0c2d36', 30);
  const armF = limb(C.skin, 22);
  const phone = h('g', {}, [h('rect', { x: -70, y: -140, width: 140, height: 280, rx: 22, fill: C.navy }), h('image', { href: '../docs/screenshots/mobile.png', x: -62, y: -130, width: 124, height: 268, 'clip-path': 'url(#phoneClip)', preserveAspectRatio: 'xMidYMin slice' })]);
  [legB, armB, shorts, torso, head, hair, legF, armF].forEach((e) => runner.appendChild(e));
  const shoes = [h('ellipse', { rx: 22, ry: 10, fill: C.white, stroke: C.navy, 'stroke-width': 2 }), h('ellipse', { rx: 22, ry: 10, fill: C.white, stroke: C.navy, 'stroke-width': 2 })];
  shoes.forEach((s) => runner.appendChild(s));
  runner.appendChild(phone);
  const seg = (path, ox, oy, a1, a2, l1, l2) => {
    const ex = ox + Math.sin(a1) * l1;
    const ey = oy + Math.cos(a1) * l1;
    const fx = ex + Math.sin(a1 + a2) * l2;
    const fy = ey + Math.cos(a1 + a2) * l2;
    path.setAttribute('d', `M${ox} ${oy} L${ex.toFixed(1)} ${ey.toFixed(1)} L${fx.toFixed(1)} ${fy.toFixed(1)}`);
    return [fx, fy];
  };
  /** run = 0 standing, 1 full stride; phase in cycles. */
  function poseRunner(run, phase, holdPhone) {
    const s = Math.sin(phase * Math.PI * 2);
    const c = Math.cos(phase * Math.PI * 2);
    const [bx, by] = seg(legB, -14, -170, run * s * 0.7, run * Math.max(0, -c) * 1.1, 82, 82);
    const [fx, fy] = seg(legF, 14, -170, -run * s * 0.7, run * Math.max(0, c) * 1.1, 82, 82);
    shoes[0].setAttribute('cx', (bx + 8).toFixed(1));
    shoes[0].setAttribute('cy', by.toFixed(1));
    shoes[1].setAttribute('cx', (fx + 8).toFixed(1));
    shoes[1].setAttribute('cy', fy.toFixed(1));
    seg(armB, -30, -310, -run * s * 0.9 + 0.1, -0.9 * run - 0.2, 64, 60);
    const [hx, hy] = holdPhone
      ? seg(armF, 30, -310, 0.5 * holdPhone, -2.2 * holdPhone, 64, 60)
      : seg(armF, 30, -310, run * s * 0.9 - 0.1, -0.9 * run - 0.2, 64, 60);
    return [hx, hy];
  }

  // ---------- data space ----------
  const data$ = h('g');
  svg.appendChild(data$);
  const curtain = h('rect', { width: 1920, height: 1080, fill: C.navy });
  data$.appendChild(curtain);
  const grid = h('g', { opacity: 0.35 });
  data$.appendChild(grid);
  for (let x = 0; x <= 1920; x += 80) grid.appendChild(h('line', { x1: x, y1: 0, x2: x, y2: 1080, stroke: C.navy2, 'stroke-width': 2 }));
  for (let y = 0; y <= 1080; y += 80) grid.appendChild(h('line', { x1: 0, y1: y, x2: 1920, y2: y, stroke: C.navy2, 'stroke-width': 2 }));

  // City nodes placed by longitude and latitude.
  // Schematic column rather than a map: ten evenly spaced, readable nodes.
  const nodes = CITIES.map(([id, name], i) => {
    const x = 420;
    const y = 230 + i * 74;
    const g = h('g');
    g.appendChild(h('circle', { cx: 0, cy: 0, r: 12, fill: COMPARED.includes(id) ? C.series[COMPARED.indexOf(id)] : '#7fa3ad' }));
    g.appendChild(h('circle', { cx: 0, cy: 0, r: 22, fill: 'none', stroke: '#7fa3ad', 'stroke-width': 2 }));
    const right = false;
    g.appendChild(h('text', { x: right ? 30 : -30, y: 8, 'text-anchor': right ? 'start' : 'end', 'font-size': 24, fill: '#cfe3e6', text: name }));
    data$.appendChild(g);
    return { g, x, y, i };
  });
  const hub = { x: 1000, y: 540 };
  const provider = { x: 1640, y: 300 };
  const spokes = nodes.map((n) => {
    const p = h('path', { d: `M${n.x} ${n.y} Q${(n.x + hub.x) / 2} ${n.y} ${hub.x} ${hub.y}`, fill: 'none', stroke: '#2f6370', 'stroke-width': 3 });
    data$.insertBefore(p, nodes[0].g);
    return p;
  });
  const trunk = h('path', { d: `M${hub.x} ${hub.y} C${hub.x + 260} ${hub.y} ${provider.x - 260} ${provider.y} ${provider.x} ${provider.y}`, fill: 'none', stroke: '#2f6370', 'stroke-width': 8, 'stroke-linecap': 'round' });
  data$.appendChild(trunk);
  const link2 = h('path', { d: 'M1560 260 C1620 260 1640 150 1626 130', fill: 'none', stroke: '#2f6370', 'stroke-width': 8, 'stroke-linecap': 'round' });
  data$.appendChild(link2);
  const hubDot = h('g', {}, [h('circle', { r: 34, fill: C.teal }), h('text', { y: 9, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 700, fill: C.white, text: '1' })]);
  data$.appendChild(hubDot);
  const hubLabel = h('text', { x: hub.x, y: hub.y + 80, 'text-anchor': 'middle', 'font-size': 26, fill: '#cfe3e6', text: 'one request' });
  data$.appendChild(hubLabel);
  const providerNode = h('g', {}, [
    h('rect', { x: -130, y: -60, width: 260, height: 120, rx: 26, fill: C.navy2, stroke: '#7fa3ad', 'stroke-width': 3 }),
    h('text', { y: -6, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 700, fill: C.white, text: 'Open-Meteo' }),
    h('text', { y: 30, 'text-anchor': 'middle', 'font-size': 22, fill: '#9cc0c8', text: 'Air Quality API' }),
  ]);
  data$.appendChild(providerNode);
  const breakMark = h('g', {}, [h('path', { d: 'M-26 -26 L26 26 M26 -26 L-26 26', stroke: '#ff8a7a', 'stroke-width': 10, 'stroke-linecap': 'round' })]);
  data$.appendChild(breakMark);
  const pulse = h('circle', { r: 14, fill: C.white });
  data$.appendChild(pulse);
  // Validation gate and returning packets.
  const gate = h('g', {}, [
    h('path', { d: 'M0 -70 L60 -40 L60 30 Q60 70 0 90 Q-60 70 -60 30 L-60 -40 Z', fill: C.navy2, stroke: '#7fd1c8', 'stroke-width': 4 }),
    h('path', { d: 'M-24 6 L-6 24 L28 -14', fill: 'none', stroke: '#7fd1c8', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]);
  data$.appendChild(gate);
  const gateLabel = h('text', { 'text-anchor': 'middle', 'font-size': 24, fill: '#cfe3e6', text: 'schema check' });
  data$.appendChild(gateLabel);
  const packets = [];
  for (let i = 0; i < 18; i++) {
    const bad = i === 7;
    const p = h('rect', { x: -14, y: -14, width: 28, height: 28, rx: 6, fill: bad ? '#ff8a7a' : C.series[i % 4] });
    data$.appendChild(p);
    packets.push({ p, bad, i });
  }
  const layers = h('g');
  data$.appendChild(layers);
  const sheets = [0, 1, 2].map((i) => {
    const s = h('path', { d: 'M-150 0 L0 -70 L150 0 L0 70 Z', fill: i === 2 ? C.teal : '#1f4f5c', stroke: '#7fd1c8', 'stroke-width': 3, opacity: 0.95 });
    layers.appendChild(s);
    return s;
  });
  const layersLabel = h('text', { 'text-anchor': 'middle', 'font-size': 24, fill: '#cfe3e6', text: 'stored locally' });
  data$.appendChild(layersLabel);

  // ---------- chart (real snapshot values) ----------
  const chart = h('g');
  data$.appendChild(chart);
  chart.appendChild(h('rect', { x: -60, y: -110, width: 1260, height: 660, rx: 26, fill: C.white }));
  chart.appendChild(h('text', { x: -10, y: -50, 'font-size': 36, 'font-weight': 800, fill: C.ink, text: 'Fine particles (PM2.5)' }));
  chart.appendChild(h('text', { x: 1150, y: -50, 'text-anchor': 'end', 'font-size': 24, fill: C.muted, text: 'µg/m³ · hourly · Asia/Jerusalem' }));
  const W = 1100;
  const H = 420;
  const xs = (tsec) => ((tsec - tMin) / (tMax - tMin)) * W;
  const ys = (v) => H - (Math.min(v, yMax) / yMax) * H;
  const axis = h('g');
  chart.appendChild(axis);
  [0, 5, 10, 15, 20].forEach((v) => {
    axis.appendChild(h('line', { x1: 0, x2: W, y1: ys(v), y2: ys(v), stroke: C.line, 'stroke-width': 2 }));
    axis.appendChild(h('text', { x: -16, y: ys(v) + 8, 'text-anchor': 'end', 'font-size': 22, fill: C.muted, class: 'mono', text: String(v) }));
  });
  const fx = xs(captured);
  const forecast = h('rect', { x: fx, y: 0, width: W - fx, height: H, fill: '#eef3f5' });
  chart.insertBefore(forecast, axis);
  const fLabel = h('text', { x: fx + 14, y: 30, 'font-size': 22, fill: C.muted, text: 'Forecast' });
  chart.appendChild(fLabel);
  const who = h('line', { x1: 0, x2: W, y1: ys(15), y2: ys(15), stroke: C.bad, 'stroke-width': 3, 'stroke-dasharray': '14 8' });
  chart.appendChild(who);
  const whoLabel = h('text', { x: 14, y: ys(15) - 12, 'font-size': 22, fill: C.bad, text: 'WHO guideline 15 (24-hour mean)' });
  chart.appendChild(whoLabel);
  const lines = data.map((pts, k) => {
    const d = pts.filter(([, v]) => v !== null).map(([tsec, v], i) => `${i ? 'L' : 'M'}${xs(tsec).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ');
    const path = h('path', { d, fill: 'none', stroke: C.series[k], 'stroke-width': 4, 'stroke-linejoin': 'round', 'clip-path': 'url(#chartClip)' });
    chart.appendChild(path);
    return path;
  });
  const legend = h('g', { transform: `translate(0 ${H + 70})` });
  chart.appendChild(legend);
  const shapes = ['M0 -9 a9 9 0 1 0 0.01 0', 'M-9 -9 h18 v18 h-18 z', 'M0 -11 L11 8 L-11 8 Z', 'M0 -12 L12 0 L0 12 L-12 0 Z'];
  COMPARED.forEach((id, k) => {
    const name = CITIES.find((c) => c[0] === id)[1];
    const item = h('g', { transform: `translate(${k * 270} 0)` }, [
      h('line', { x1: 0, x2: 44, y1: 0, y2: 0, stroke: C.series[k], 'stroke-width': 4 }),
      h('path', { d: shapes[k], transform: 'translate(22 0)', fill: C.series[k] }),
      h('text', { x: 58, y: 9, 'font-size': 26, fill: C.ink, text: name }),
    ]);
    legend.appendChild(item);
  });
  // The banner uses the app's own wording for the stale state.
  const banner = h('g', {}, [
    h('rect', { x: 0, y: 0, width: 760, height: 96, rx: 18, fill: C.amberSoft, stroke: '#ecd49a', 'stroke-width': 3 }),
    h('rect', { x: 34, y: 38, width: 20, height: 20, rx: 4, fill: C.amber }),
    h('text', { x: 72, y: 46, 'font-size': 28, 'font-weight': 800, fill: C.amber, text: 'Saved data' }),
    h('text', { x: 72, y: 78, 'font-size': 22, fill: C.amber, text: 'Showing saved data. Last provider error: network.' }),
  ]);
  data$.appendChild(banner);

  // ---------- result card and end ----------
  const result = h('g', {}, [
    h('rect', { x: 0, y: 0, width: 420, height: 200, rx: 24, fill: C.white, stroke: C.line, 'stroke-width': 3 }),
    h('text', { x: 32, y: 56, 'font-size': 28, 'font-weight': 700, fill: C.ink, text: 'Tel Aviv-Yafo' }),
    h('rect', { x: 32, y: 84, width: 18, height: 80, rx: 5, fill: band === 'Good' ? '#50f0e6' : band === 'Fair' ? '#50ccaa' : '#f0e641', stroke: '#00000022' }),
    h('text', { x: 70, y: 140, 'font-size': 64, class: 'mono', fill: C.ink, text: String(Math.round(latestAqi)) }),
    h('text', { x: 70 + String(Math.round(latestAqi)).length * 38 + 16, y: 140, 'font-size': 30, fill: C.ink, text: `EAQI · ${band}` }),
  ]);
  city.appendChild(result);
  const end = h('g');
  svg.appendChild(end);
  end.appendChild(h('rect', { width: 1920, height: 1080, fill: C.mist }));
  const mark = h('g', {}, [h('circle', { r: 86, fill: C.teal }), h('path', { d: 'M-50 -16 c26 -20 44 20 70 0 s34 -14 34 -6 M-50 22 c26 -20 44 20 70 0 s34 -14 34 -6', fill: 'none', stroke: C.white, 'stroke-width': 12, 'stroke-linecap': 'round' })]);
  end.appendChild(mark);
  const title = h('text', { x: 960, y: 610, 'text-anchor': 'middle', 'font-size': 124, 'font-weight': 800, fill: C.ink, text: 'Airwise' });
  const tag = h('text', { x: 960, y: 680, 'text-anchor': 'middle', 'font-size': 40, fill: C.muted, text: 'Air quality across Israel and the Eastern Mediterranean' });
  const repo = h('text', { x: 960, y: 770, 'text-anchor': 'middle', 'font-size': 32, class: 'mono', fill: C.teal, text: 'github.com/gad-rapaport/airwise' });
  const credit = h('text', { x: 960, y: 1010, 'text-anchor': 'middle', 'font-size': 22, fill: C.muted, text: 'Data: Open-Meteo Air Quality API, CAMS forecasts, CC BY 4.0' });
  [title, tag, repo, credit].forEach((e) => end.appendChild(e));

  // ---------- captions ----------
  const capText = h('text', { x: 120, y: 112, 'font-size': 58, 'font-weight': 800 });
  const capBar = h('rect', { x: 120, y: 136, height: 8, rx: 4 });
  svg.appendChild(capText);
  svg.appendChild(capBar);
  const CAPS = [
    { from: 0.7, to: 4.0, text: 'Run now, or wait for cleaner air?', dark: false },
    { from: 4.8, to: 9.2, text: 'Ten cities, one request, checked before storing.', dark: true },
    { from: 9.8, to: 12.8, text: 'Real data, compared against the WHO line.', dark: true },
    { from: 13.0, to: 15.6, text: 'Provider down? Saved data stays, clearly labelled.', dark: true },
    { from: 16.0, to: 17.8, text: 'Fair air. Good to go.', dark: false },
  ];

  stage.add((t) => {
    // City and runner.
    towers.forEach(({ rect, hgt, delay }) => {
      const p = ease.outCubic(prog(t, delay, 0.8));
      rect.setAttribute('y', (880 - hgt * p).toFixed(1));
      rect.setAttribute('height', (hgt * p).toFixed(1));
    });
    const cleanAir = prog(t, 15.6, 1.2);
    [...haze.children].forEach((d, i) => {
      const x = (rand(i) * 2100 + t * (14 + rand(i + 5) * 26)) % 2100 - 90;
      place(d, { x, y: 180 + rand(i + 9) * 680 + wave(t, 4 + rand(i) * 3, 14), o: (0.25 + rand(i + 2) * 0.35) * (1 - cleanAir * 0.85) });
    });
    sun.setAttribute('fill', cleanAir > 0 ? '#f6c66f' : '#f1d9a8');
    const running = prog(t, 16.4, 0.6);
    const rx = t < 16.4 ? 430 : tw(t, 16.4, 2.0, 430, 2200, ease.inQuad);
    place(runner, { x: rx, y: 880 - (running ? Math.abs(wave(t, 0.36, 18)) * running : 0) });
    const hold = 1 - prog(t, 16.2, 0.3);
    const [hx, hy] = poseRunner(running, t / 0.72, hold > 0.02 ? hold : 0);
    place(phone, { x: hx + 6, y: hy - 30, s: 0.35, o: hold });
    place(result, { x: 1360, y: tw(t, 16.0, 0.6, 580, 520, ease.outBack), o: life(t, 16.0, 18.4, 0.3, 0.3) });

    // Transition in: the phone grows into the dark data space (4.0 -> 4.8).
    const into = ease.inOutCubic(prog(t, 4.0, 0.8));
    const out = ease.inOutCubic(prog(t, 15.4, 0.7));
    const r = into * (1 - out);
    data$.setAttribute('opacity', (t < 4 || (t > 15 && r < 0.02) ? 0 : 1).toString());
    const cw = 49 + r * 1871;
    const ch = 98 + r * 982;
    const cx = (rx + hx + 6) * (1 - r) + 960 * r;
    const cy = (880 + hy - 30) * (1 - r) + 540 * r;
    curtain.setAttribute('x', (cx - cw / 2).toFixed(1));
    curtain.setAttribute('y', (cy - ch / 2).toFixed(1));
    curtain.setAttribute('width', cw.toFixed(1));
    curtain.setAttribute('height', ch.toFixed(1));
    curtain.setAttribute('rx', (22 * (1 - r)).toFixed(1));
    const inner = r > 0.98 ? 1 : 0;
    const contentOn = inner * life(t, 4.7, 15.5, 0.3, 0.2);
    grid.setAttribute('opacity', (0.35 * contentOn).toFixed(3));

    // Spokes and nodes (4.9 -> 6.0), request pulse to provider (6.0 -> 6.8).
    nodes.forEach((n, i) => {
      place(n.g, { x: n.x, y: n.y, s: tw(t, 4.9 + i * 0.06, 0.4, 0.2, 1, ease.outBack), o: contentOn * prog(t, 4.9 + i * 0.06, 0.2) * (1 - prog(t, 9.3, 0.4)) });
      const len = spokes[i].getTotalLength();
      spokes[i].setAttribute('stroke-dasharray', `${len} ${len}`);
      spokes[i].setAttribute('stroke-dashoffset', (len * (1 - ease.inOutCubic(prog(t, 5.3 + i * 0.03, 0.6)))).toFixed(1));
      spokes[i].setAttribute('opacity', (contentOn * (1 - prog(t, 9.3, 0.4))).toFixed(3));
    });
    place(hubDot, { x: hub.x, y: hub.y, s: tw(t, 5.9, 0.4, 0, 1, ease.outBack), o: contentOn * (1 - prog(t, 9.3, 0.4)) });
    hubLabel.setAttribute('opacity', (contentOn * life(t, 6.0, 9.2, 0.3, 0.3)).toFixed(3));
    const tl = trunk.getTotalLength();
    trunk.setAttribute('stroke-dasharray', `${tl} ${tl}`);
    trunk.setAttribute('stroke-dashoffset', (tl * (1 - ease.inOutCubic(prog(t, 6.0, 0.5)))).toFixed(1));
    const broken = t > 13.3;
    trunk.setAttribute('stroke', broken ? '#5b3a3a' : '#2f6370');
    trunk.setAttribute('opacity', (contentOn * (1 - prog(t, 9.3, 0.4))).toFixed(3));
    // During the outage the provider sits top right, linked to the chart by a short line that breaks.
    const late = t > 12.9;
    place(providerNode, late ? { x: 1730, y: 130, s: 0.8, o: contentOn * prog(t, 12.9, 0.3) } : { x: provider.x, y: provider.y, s: tw(t, 6.2, 0.4, 0.6, 1, ease.outBack), o: contentOn * prog(t, 6.2, 0.3) * (1 - prog(t, 9.3, 0.4)) });
    const ll = link2.getTotalLength();
    link2.setAttribute('stroke-dasharray', ` `);
    link2.setAttribute('stroke-dashoffset', (ll * (1 - ease.outCubic(prog(t, 12.95, 0.4)))).toFixed(1));
    link2.setAttribute('stroke', broken ? '#5b3a3a' : '#2f6370');
    link2.setAttribute('opacity', (contentOn * (late ? 1 : 0)).toFixed(3));
    const mid = link2.getPointAtLength(ll * 0.5);
    place(breakMark, { x: mid.x, y: mid.y, s: tw(t, 13.3, 0.3, 0.2, 1, ease.outBack), o: contentOn * (broken ? 1 : 0) });
    const pp = prog(t, 6.4, 0.6);
    const pt = trunk.getPointAtLength(tl * ease.inOutQuad(pp));
    place(pulse, { x: pt.x, y: pt.y, o: contentOn * (pp > 0 && pp < 1 ? 1 : 0) });

    // Response packets travel back, through the gate (one rejected), into the layers.
    const gx = 1330;
    const gy = 470;
    place(gate, { x: gx, y: gy, s: tw(t, 6.8, 0.4, 0.4, 1, ease.outBack), o: contentOn * life(t, 6.8, 9.3, 0.3, 0.3) });
    gateLabel.setAttribute('x', gx);
    gateLabel.setAttribute('y', gy + 130);
    gateLabel.setAttribute('opacity', (contentOn * life(t, 7.0, 9.3, 0.3, 0.3)).toFixed(3));
    const lx = 1000;
    const ly = 800;
    packets.forEach(({ p, bad, i }) => {
      const start = 7.0 + i * 0.07;
      const a = prog(t, start, 0.5);
      const b = prog(t, start + 0.5, 0.6);
      let x;
      let y;
      let o = contentOn;
      if (a < 1) {
        x = tw(t, start, 0.5, provider.x - 60, gx, ease.inOutQuad);
        y = tw(t, start, 0.5, provider.y + 40 + (i % 4) * 14, gy + ((i % 5) - 2) * 18, ease.inOutQuad);
      } else if (bad) {
        x = gx + b * 120;
        y = gy - Math.sin(b * Math.PI) * 140 + b * 260;
        o *= 1 - b;
      } else {
        x = tw(t, start + 0.5, 0.6, gx, lx, ease.inOutCubic);
        y = tw(t, start + 0.5, 0.6, gy, ly - 40, ease.inOutCubic);
        o *= 1 - prog(t, start + 1.0, 0.1);
      }
      place(p, { x, y, r: t * 120 + i * 20, o: a > 0 ? o * (1 - prog(t, 9.3, 0.2)) : 0 });
    });
    place(layers, { x: lx, y: ly, o: contentOn * prog(t, 7.6, 0.3) * (1 - prog(t, 9.4, 0.4)) });
    sheets.forEach((s, i) => s.setAttribute('transform', `translate(0 ${(-i * tw(t, 7.8 + i * 0.4, 0.5, 0, 30, ease.outBack)).toFixed(1)})`));
    layersLabel.setAttribute('x', lx);
    layersLabel.setAttribute('y', ly + 120);
    layersLabel.setAttribute('opacity', (contentOn * life(t, 8.0, 9.3, 0.3, 0.3)).toFixed(3));

    // Chart rises out of the layers (9.4 -> 10.0) and draws its lines from the real data.
    const chartIn = ease.outCubic(prog(t, 9.4, 0.7));
    place(chart, { x: 360, y: 290 + (1 - chartIn) * 420, s: 0.7 + chartIn * 0.3, o: contentOn * chartIn });
    forecast.setAttribute('opacity', prog(t, 11.2, 0.5).toFixed(3));
    fLabel.setAttribute('opacity', prog(t, 11.4, 0.5).toFixed(3));
    lines.forEach((l, k) => {
      const len = l.getTotalLength();
      l.setAttribute('stroke-dasharray', `${len} ${len}`);
      l.setAttribute('stroke-dashoffset', (len * (1 - ease.inOutCubic(prog(t, 10.0 + k * 0.2, 1.6)))).toFixed(1));
    });
    const whoP = ease.outCubic(prog(t, 11.8, 0.6));
    who.setAttribute('x2', (W * whoP).toFixed(1));
    whoLabel.setAttribute('opacity', prog(t, 12.0, 0.4).toFixed(3));
    legend.setAttribute('opacity', prog(t, 10.2, 0.4).toFixed(3));
    place(banner, { x: 580, y: tw(t, 13.6, 0.5, 940, 880, ease.outBack), o: contentOn * life(t, 13.6, 15.5, 0.25, 0.25) });

    // End card.
    const endOn = prog(t, 17.8, 0.5);
    end.setAttribute('opacity', endOn.toFixed(3));
    place(mark, { x: 960, y: 380, s: tw(t, 18.0, 0.6, 0.4, 1, ease.outBack), r: tw(t, 18.0, 0.8, -40, 0) });
    [title, tag, repo, credit].forEach((e, i) => place(e, { y: tw(t, 18.3 + i * 0.15, 0.5, 30, 0), o: prog(t, 18.3 + i * 0.15, 0.4) }));

    const cap = CAPS.find((c) => t >= c.from && t <= c.to);
    if (cap) {
      const o = life(t, cap.from, cap.to, 0.25, 0.25);
      capText.textContent = cap.text;
      capText.setAttribute('fill', cap.dark ? C.white : C.ink);
      capBar.setAttribute('fill', cap.dark ? '#7fd1c8' : C.teal);
      place(capText, { y: tw(t, cap.from, 0.4, 16, 0), o });
      capBar.setAttribute('width', (ease.outCubic(prog(t, cap.from + 0.1, 0.5)) * 140).toFixed(1));
      capBar.setAttribute('opacity', o.toFixed(3));
    } else {
      capText.setAttribute('opacity', 0);
      capBar.setAttribute('opacity', 0);
    }
  });

  attachPlayer(stage);
}
