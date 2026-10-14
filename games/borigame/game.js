/* 동생아, 그거 아니야 — 웹 프로토타입 */
(function () {
  'use strict';
  const E = window.BoriEngine;
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const SPEED = Math.max(0.25, Math.min(20, +Q.get('speed') || 1)); // 테스트용 시간 배속
  let rng = Math.random;
  if (Q.get('seed')) { let a = +Q.get('seed') | 0; rng = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const FACES = { wait: 'img/wait.jpg', pout: 'img/pout.jpg', smug: 'img/smug.jpg', sulk: 'img/sulk.jpg', angry: 'img/angry.jpg', happy: 'img/happy.jpg', title: 'img/title.jpg' };
  Object.values(FACES).forEach(src => { const i = new Image(); i.src = src; });
  const LEVEL_NAME = { easy: '쉬움', medium: '보통', hard: '어려움' };
  const NEXT = { easy: 'medium', medium: 'hard', hard: 'tie' };

  let call = '오빠';
  let st = null, level = 'easy', playing = false, paused = false;
  let lockUntil = 0, lockLabel = '', direct = null, carryMood = null;
  let consecMiss = 0, lastT = 0, faceTimer = 0, wiggle = 0, highlight = null;

  // ---------- 룰셋 로드 ----------
  const ready = fetch('rules.json').then(r => r.json()).then(r => { E.setRules(r); }).catch(() => { E.setRules({}); });
  ready.then(() => {
    const R = E.getRules();
    const f = s => `${Math.floor(s / 60)}분${s % 60 ? ' ' + (s % 60) + '초' : ''}`;
    $('tEasy').textContent = '제한 ' + f(R.timeLimit.easy); $('tMedium').textContent = '제한 ' + f(R.timeLimit.medium); $('tHard').textContent = '제한 ' + f(R.timeLimit.hard);
  });

  // ---------- 화면 전환 ----------
  const screens = ['scTitle', 'scHow', 'scSelect', 'scPause', 'scFail', 'scResult', 'scTie'];
  function show(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
  function hideAll() { screens.forEach(s => $(s).classList.add('hidden')); }
  let howReturn = 'scTitle';
  $('goSelect').onclick = () => { call = document.querySelector('input[name=call]:checked').value; show('scSelect'); };
  $('goHow').onclick = () => { howReturn = 'scTitle'; show('scHow'); };
  $('howClose').onclick = () => { if (howReturn === 'game') { hideAll(); paused = false; } else show(howReturn); };
  $('selBack').onclick = () => show('scTitle');
  document.querySelectorAll('.stageBtn').forEach(b => b.onclick = () => { const lv = b.dataset.level; if (lv === 'tie') startTie(); else startRound(lv); });
  $('btnPause').onclick = () => { if (!playing) return; paused = true; show('scPause'); };
  $('resume').onclick = () => { hideAll(); paused = false; };
  $('pHow').onclick = () => { howReturn = 'game'; show('scHow'); };
  $('pQuit').onclick = () => { playing = false; endDirect(true); show('scSelect'); };
  $('failRetry').onclick = () => startRound(level);
  $('failResult').onclick = () => showResult();
  $('resRetry').onclick = () => startRound(level);
  $('resMenu').onclick = () => show('scSelect');
  $('resNext').onclick = () => { const n = NEXT[level]; if (n === 'tie') startTie(); else startRound(n); };
  $('listToggle').onclick = () => $('listWrap').classList.toggle('closed');

  // ---------- 보리 표정·말풍선 ----------
  function face(f, ms) {
    $('bori').src = FACES[f] || FACES.wait;
    clearTimeout(faceTimer);
    if (ms) faceTimer = setTimeout(() => { if (playing) $('bori').src = E.band(st.mood) === 'low' ? FACES.pout : FACES.wait; }, ms);
  }
  function say(text, sub) {
    let t = text || '';
    if (t && !/^[…(]/.test(t) && rng() < 0.35 && /[!?.]$|[가-힣]$/.test(t)) t = t.replace(/([!?.~]*)$/, `, ${call}$1`);
    $('bubbleText').textContent = t; $('bubbleSub').textContent = sub || '';
    const b = $('bubble'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  function boriAnim(cls, ms) { const w = $('boriWrap'); w.className = ''; void w.offsetWidth; if (cls) w.classList.add(cls); if (ms) setTimeout(() => w.classList.remove(cls), ms); }
  function canvasAnim(cls, ms) { const c = $('cv'); c.className = ''; void c.offsetWidth; if (cls) c.classList.add(cls); if (ms) setTimeout(() => c.classList.remove(cls), ms); }
  function stamp(text, good) { const s = $('stamp'); s.textContent = text; s.classList.toggle('good', !!good); s.classList.add('on'); setTimeout(() => s.classList.remove('on'), 900); }
  function cardInfo(text) { const c = $('cardInfo'); c.textContent = text; c.classList.add('on'); clearTimeout(cardInfo.t); cardInfo.t = setTimeout(() => c.classList.remove('on'), 2600); }
  function pop(text, color) { const p = $('pop'); p.textContent = text; p.style.color = color || '#fff'; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); }

  // ---------- 사운드 (짧은 합성음) ----------
  let ac = null;
  function beep(f1, f2, dur, type) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f1, ac.currentTime); o.frequency.exponentialRampToValueAtTime(f2, ac.currentTime + dur);
      g.gain.setValueAtTime(0.12, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    } catch (e) { }
  }
  const SFX = { good: () => beep(500, 900, .15), miss: () => beep(700, 200, .35, 'triangle'), add: () => beep(400, 800, .12, 'square'), yell: () => beep(200, 120, .3, 'sawtooth'), warn: () => beep(900, 1400, .25, 'sawtooth'), clear: () => { beep(520, 1040, .2); setTimeout(() => beep(660, 1320, .25), 160); } };

  // ---------- 라운드 ----------
  function startRound(lv) {
    level = lv; hideAll();
    const R = E.getRules();
    const mood = carryMood != null ? Math.max(R.mood.carryMin, carryMood) : R.mood.start;
    st = E.newRound(lv, { rng, mood });
    playing = true; paused = false; lockUntil = 0; direct = null; consecMiss = 0; highlight = null;
    document.body.classList.remove('direct');
    $('boriWrap').className = ''; $('cv').className = '';
    $('inp').disabled = false; $('inp').value = '';
    face('wait');
    say(lv === 'easy' ? '또 나야? …뭐부터 해?' : lv === 'medium' ? '이건 가방 바닥에서 나왔어. 매듭도 있음' : '고양이가 갖고 놀았대. 난 몰라', '이름표(L·R·Y·A·B·잭)로 말해 줘');
    $('heardText').textContent = '🎙 “' + (lv === 'easy' ? 'L을 R 쪽으로 돌려' : '잭을 A 고리에서 빼') + '” 처럼 말해 보세요';
    $('heardParse').textContent = '';
    renderExamples(); updateHud(); buildGeometry(); lastT = performance.now();
  }

  function now() { return st ? st.t : 0; }
  function locked() { return now() < lockUntil; }
  function setLock(sec, label) { lockUntil = now() + sec; lockLabel = label || ''; }

  function submit(text, loud) {
    if (!playing || paused || !st || st.status !== 'play') return;
    text = (text || '').trim(); if (!text) return;
    if (direct) { if (/그만|돌아가|됐어|네가 해/.test(text)) endDirect(); return; }
    if (locked()) return;
    const p = E.parse(text, { loud });
    showHeard(text, p, loud);
    if (p.direct) { beginDirect(); return; }
    const ev = E.step(st, p, now());
    handle(ev, p);
  }

  function showHeard(text, p, loud) {
    $('heardText').textContent = `${loud ? '📢' : '🎙'} “${text}”`;
    const R = E.getRules();
    let cls = '', lab;
    if (p.yell) { lab = '소리 지름'; cls = 'always'; }
    else if (p.long) { lab = '너무 김'; cls = 'always'; }
    else if ((p.dir === '왼쪽' || p.dir === '오른쪽') && !p.dirRef) { lab = '기준 없는 ' + p.dir + ' → 보리 기준'; cls = 'always'; }
    else if ((p.dir === '위' || p.dir === '아래') && !p.dirRef && (R.alwaysMissUpDownWithTag || !p.target)) { lab = '대상 없는 ' + p.dir; cls = 'always'; }
    else if (p.pronoun) { lab = '“그거”가 뭔지 모름'; cls = 'always'; }
    else if (!p.verb && !p.meta) { lab = '동작 못 알아들음'; cls = 'vague'; }
    else if (p.target) lab = (p.ref || p.dir) ? '명확' : '보통 (기준을 붙이면 더 정확)';
    else { lab = '애매 (대상 없음)'; cls = 'vague'; }
    const bits = [];
    if (p.target) bits.push('대상 ' + p.target); if (p.ref) bits.push('기준 ' + p.ref); if (p.verb) bits.push('동작 ' + p.verb); if (p.mods.soft) bits.push('살살'); if (p.mods.hard) bits.push('세게');
    $('heardParse').innerHTML = (bits.length ? bits.join(' · ') + ' · ' : '') + `<b class="${cls}">${lab}</b>`;
    highlight = p.target ? { tag: p.target, until: performance.now() + 1500, color: '#7fd1b9' } : null;
  }

  function handle(ev, p) {
    const R = E.getRules();
    const lockSec = (ev.lockSec || 0.6);
    switch (ev.kind) {
      case 'good': {
        face('happy', 1600); boriAnim('hop', 800); stamp(ev.loosened ? '매듭 풀림!' : '풀림!', true);
        say(ev.line, ev.sub ? '⚠ ' + ev.sub : ''); SFX.good(); consecMiss = 0;
        if (ev.removed) pop('교차 −1', '#7fd1b9'); else if (ev.loosened) pop('매듭 → 걸림', '#ffd43b');
        setLock(Math.min(lockSec, 2.2), '보리가 하는 중…'); break;
      }
      case 'miss': case 'broke': {
        const c = E.CARDS[ev.card] || {};
        if (ev.kind === 'miss') {
          face('smug', 2200); stamp('오해!'); SFX.miss(); consecMiss++;
          cardInfo(`오해 카드 #${ev.card} ‘${c.verb}’ → ${c.act}` + (ev.delta > 0 ? ` · 교차 +${ev.delta}` : ''));
          say(ev.line, ev.sub ? '⚠ ' + ev.sub : '');
          const anim = c.anim;
          if (anim === 'spin') boriAnim('spin', 900); else if (anim === 'shake') boriAnim('shake', 1000); else if (anim === 'lift') boriAnim('lift', 900);
          else if (anim === 'freeze') boriAnim('freeze', R.freezeSec * 1000 / SPEED); else if (anim === 'hand' || anim === 'palm' || anim === 'finger' || anim === 'ear' || anim === 'hood' || anim === 'point') boriAnim('hop', 800);
          if (anim === 'fling') canvasAnim('fling', 700); else if (anim === 'pull') canvasAnim('pull', 600); else if (anim === 'fast' || anim === 'wrap' || anim === 'grab') canvasAnim('fast', 700); else if (anim === 'pocket') canvasAnim('pocket');
          if (ev.mirror) highlight = { tag: ev.mirror, until: performance.now() + 2000, color: '#ff4d4d' };
          if (ev.delta > 0) { setTimeout(SFX.add, 300); pop(`교차 +${ev.delta}`, '#ff4d4d'); bump(); }
          if (ev.warn) SFX.warn();
          let label = '오해 중…';
          if (ev.card === 9) label = '살~살~ 하는 중'; if (ev.card === 16) label = '…(얼음)';
          setLock(lockSec, label);
          if (consecMiss >= 3) $('btnDirect').classList.add('tempt');
        }
        if (ev.kind === 'broke') breakCable(ev);
        break;
      }
      case 'yell': face('sulk'); boriAnim('shake', 1000); say(ev.line, `😤 ${R.sulkSec}초 동안 삐짐 · 기분 ${ev.moodDelta}`); SFX.yell(); setLock(ev.lockSec, '😤 삐짐'); break;
      case 'sulking': say(ev.line); break;
      case 'long': face('pout', 1500); say(ev.line, '한 번에 한 동작만'); setLock(0.8); break;
      case 'unknown': face('pout', 1500); say(ev.line, '예: “잭을 B 고리에서 빼”'); renderExamples(true); setLock(0.6); break;
      case 'question': face('pout', 1500); say(ev.line); break;
      case 'polite': face('happy', 1500); say(ev.line, `기분 +${ev.moodDelta}`); break;
      case 'refuse': face('sulk', 1500); say(ev.line, '흥 모드: 기분을 올려 줘'); setLock(1); break;
      case 'noop': face('pout', 1500); say(ev.line, '거기는 안 꼬였어. ‘꼬인 곳’ 목록을 봐'); setLock(Math.min(lockSec, 1.8), '보리가 하는 중…'); break;
      case 'pocket': face('smug', 1500); say(ev.line, '“주머니에서 꺼내”라고 해 봐'); setLock(0.8); break;
      case 'unpocket': face('pout', 1500); canvasAnim(''); say(ev.line); setLock(1); break;
      case 'tighten': face('pout', 1500); say(ev.line, '매듭은 살살 당겨야 해'); SFX.warn(); setLock(1.5); break;
      case 'stop': say(ev.line); break;
      case 'leave': leave(ev); return;
    }
    if (ev.kind !== 'miss' && ev.kind !== 'broke' && ev.kind !== 'sulking') { /* keep */ }
    if (ev.kind === 'good' || ev.kind === 'polite' || ev.moodDelta > 0) $('btnDirect').classList.remove('tempt');
    afterChange(ev);
  }

  function bump() { const b = $('nCross'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }

  function afterChange(ev) {
    buildGeometry(); wiggle = 1; updateHud();
    if (ev && ev.cleared) clearRound(ev);
    if (st.status === 'leave') leave({ line: '나 안 해.' });
  }

  // ---------- 직접 하기 ----------
  function beginDirect() {
    if (!playing || paused || direct || st.status !== 'play') return;
    const ev = E.startDirect(st, now());
    showHeardSimple('✋ 내가 할게');
    if (ev.kind === 'leave') { leave(ev); return; }
    direct = { until: now() + ev.sec, hands: ev.cap, drag: null };
    document.body.classList.add('direct');
    face('sulk'); say(ev.line, `기분 ${E.getRules().mood.direct} · 말로만 클리어 실패`);
    $('btnDirect').classList.remove('tempt'); $('inp').disabled = true;
    updateHud(); beep(300, 600, .15);
  }
  function showHeardSimple(t) { $('heardText').textContent = t; $('heardParse').textContent = ''; }
  function endDirect(silent) {
    if (!direct) return;
    direct = null; document.body.classList.remove('direct'); $('inp').disabled = false;
    if (!silent && playing && st.status === 'play') { const ev = E.endDirect(st); face('pout', 1500); say(ev.line); }
    updateHud();
  }
  $('btnDirect').onclick = () => { if (direct) endDirect(); else beginDirect(); };
  document.addEventListener('keydown', (e) => {
    if (e.target === $('inp')) { if (e.key === 'Escape') $('inp').blur(); return; }
    if (e.code === 'Space' && playing && !paused) { e.preventDefault(); if (direct) endDirect(); else beginDirect(); }
    else if (e.key === 'Enter' && playing && !direct) { e.preventDefault(); $('inp').focus(); }
    else if ((e.key === 'r' || e.key === 'R') && !$('scFail').classList.contains('hidden')) startRound(level);
    else if (e.key === 'Escape' && playing) { paused = true; show('scPause'); }
    else if ((e.key === 'v' || e.key === 'V') && playing && !e.repeat) micDown();
  });
  document.addEventListener('keyup', (e) => { if ((e.key === 'v' || e.key === 'V') && e.target !== $('inp')) micUp(); });

  // ---------- 끝 ----------
  let lastResult = null;
  function summary() {
    const s = st.stats; const tot = s.solvedVoice + s.solvedHand;
    return { level, status: st.status, voiceOnly: st.status === 'clear' && st.voiceOnly, t: Math.min(st.t, st.timeLimit), voiceRatio: tot ? s.solvedVoice / tot : 1,
      handRatio: tot ? s.solvedHand / tot : 0, yells: s.yells, misses: s.misses, mood: st.mood, directUses: st.directUses, instr: s.instr };
  }
  function clearRound(ev) {
    playing = false; endDirect(true); carryMood = st.mood;
    face('happy'); say(ev.clearLine || '풀렸다!'); stamp('클리어!', true); SFX.clear();
    setTimeout(showResult, 1400 / Math.max(1, SPEED / 2));
  }
  function breakCable(ev) {
    playing = false; endDirect(true); carryMood = null;
    $('stage').style.filter = 'grayscale(.7)';
    face('angry'); say('…'); beep(1800, 1700, .05, 'square');
    setTimeout(() => { $('stage').style.filter = ''; $('failImg').src = FACES.angry; $('failLine').textContent = '……화 안 났어.'; $('failTitle').textContent = '이어폰 사망 💔 (세게 경고 3번)'; show('scFail'); }, 1500 / Math.max(1, SPEED / 2));
  }
  function leave(ev) {
    playing = false; endDirect(true); carryMood = null;
    face('sulk'); say(ev.line || '나 안 해.'); boriAnim('leave');
    setTimeout(() => { $('failImg').src = FACES.sulk; $('failLine').textContent = ev.line || '나 안 해.'; $('failTitle').textContent = '보리가 자리를 떴다 🚪 (기분 0)'; show('scFail'); }, 1300 / Math.max(1, SPEED / 2));
  }
  function timeUp() {
    E.timeUp(st); playing = false; endDirect(true); carryMood = null;
    face('pout'); say('시간 끝~ 내 잘못 아님'); setTimeout(showResult, 1200 / Math.max(1, SPEED / 2));
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function showResult() {
    const r = summary(); lastResult = r;
    const clear = r.status === 'clear';
    const title = E.title(r);
    $('resTitle').textContent = clear ? `${LEVEL_NAME[level]} 클리어!` : ({ broke: '이어폰 사망', leave: '보리 퇴장', timeup: '시간 초과' })[r.status] || '끝';
    const stars = clear ? 1 + (r.voiceOnly ? 1 : 0) + (r.yells === 0 && r.voiceOnly ? 1 : 0) : 0;
    $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('badge').textContent = title;
    $('resImg').src = clear ? (r.voiceOnly ? FACES.happy : FACES.sulk) : (r.status === 'broke' ? FACES.angry : FACES.pout);
    $('resLine').textContent = clear ? (r.voiceOnly ? '말로 해 주니까 좋잖아' : '반은 내가 했거든?') : (r.status === 'leave' ? '다음엔 착하게 말해' : r.status === 'broke' ? '새 거 사 줘' : '시간이 너무 짧았어');
    const rows = [
      ['말로만 클리어', r.voiceOnly ? '✔' : '✘'],
      ['⏱ 걸린 시간', fmt(r.t)],
      ['🎙 말로 시킨 비율', Math.round(r.voiceRatio * 100) + '%'],
      ['📢 소리 지른 횟수', r.yells],
      ['🌀 오해 횟수', r.misses],
      ['✋ 직접 하기', r.directUses + '번'],
      ['😤 기분', `${r.mood}/10`]
    ];
    $('resTable').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    $('resNext').classList.toggle('hidden', !clear);
    $('shareMsg').textContent = '';
    show('scResult');
  }
  function shareText() {
    const r = lastResult; if (!r) return '';
    const head = r.status === 'clear' ? `${LEVEL_NAME[r.level]} ${r.voiceOnly ? '말로만 클리어!' : '클리어 (직접 좀 함)'}` : `${LEVEL_NAME[r.level]} 실패 (${({ broke: '이어폰 사망', leave: '동생 퇴장', timeup: '시간 초과' })[r.status]})`;
    return `🎧 동생아, 그거 아니야 — ${head} ⏱${fmt(r.t)} · 오해 ${r.misses}번 · 소리 ${r.yells}번 · 칭호 「${E.title(r)}」`;
  }
  $('resShare').onclick = async () => {
    const url = location.origin + location.pathname;
    const text = shareText();
    try {
      if (navigator.share) { await navigator.share({ title: '동생아, 그거 아니야', text, url }); $('shareMsg').textContent = '공유했어요!'; return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); $('shareMsg').textContent = '복사했어요! 붙여넣기 해서 자랑하세요.'; }
    catch (e) { $('shareMsg').textContent = text + ' ' + url; }
  };

  // ---------- HUD ----------
  function updateHud() {
    if (!st) return;
    $('nCross').textContent = E.crossCount(st); $('nKnot').textContent = E.knotCount(st);
    $('warn').textContent = '●'.repeat(st.warnings) + '○'.repeat(Math.max(0, E.getRules().breakAt - st.warnings));
    const m = st.mood, b = E.band(m);
    $('moodFill').style.width = (m * 10) + '%';
    $('moodFill').style.background = b === 'good' ? '#7fd1b9' : b === 'mid' ? '#fff' : '#ffd43b';
    $('moodTxt').textContent = `기분 ${m}` + (b === 'low' ? ' 흥 모드' : b === 'good' ? ' 😊' : '');
    $('moodBox').classList.toggle('huff', b === 'low');
    const ul = $('list');
    ul.innerHTML = st.crossings.map((c, i) => `<li class="${c.type === 'knot' ? 'knot' : ''}"><i>${c.type === 'knot' ? '🪢' : '●' + (i + 1)}</i>${E.describe(c)}<em>${E.hint(c)}</em></li>`).join('') || '<li>다 풀렸다!</li>';
    if (direct) { $('directLeft').textContent = Math.max(0, Math.ceil(direct.until - now())); $('handsLeft').textContent = direct.hands; }
  }
  function renderExamples(force) {
    if (!st) return;
    const ex = [];
    const c = st.crossings[0];
    if (c) {
      if (c.type === 'hook') ex.push(`${E.obj(c.a)} ${c.b} 고리에서 빼`);
      if (c.type === 'over') ex.push(`${E.obj(c.a)} 위로 빼`);
      if (c.type === 'under') ex.push(`${E.obj(c.a)} ${c.b} 밑으로 넣어`);
      if (c.type === 'twist') ex.push('L을 R 쪽으로 돌려');
      if (c.type === 'knot') ex.push(`${c.a} 매듭 살살 당겨`);
    }
    ex.push('잭을 A 고리 밑으로 넣어', 'L 태그를 위로 빼', '제발 부탁해', '왼쪽 이어폰 빼 봐', '내가 할게');
    $('examples').innerHTML = '';
    [...new Set(ex)].slice(0, 6).forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => { $('inp').value = t; $('inp').focus(); }; $('examples').appendChild(b); });
  }

  $('chat').addEventListener('submit', (e) => { e.preventDefault(); const v = $('inp').value; $('inp').value = ''; submit(v, false); });

  // ---------- 음성 (누르고 말하기) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recOn = false, recText = '', loudFrames = 0, peakLoud = false, analyser = null, micStream = null, baseline = null, levels = [];
  if (!SR) { $('btnMic').classList.add('off'); $('btnMic').title = '이 브라우저는 음성 인식을 지원하지 않아요. 채팅으로 해 주세요.'; }
  async function ensureMeter() {
    if (analyser || !navigator.mediaDevices) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(micStream); analyser = ac.createAnalyser(); analyser.fftSize = 1024; src.connect(analyser);
    } catch (e) { analyser = null; }
  }
  function meterTick() {
    if (!recOn || !analyser) return;
    const a = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a);
    let s = 0; for (const v of a) s += v * v; const rms = Math.sqrt(s / a.length);
    levels.push(rms);
    const thr = Math.max(0.12, (baseline || 0.03) * 4); // 평소 말소리 평균의 4배(약 +12dB)
    if (rms > thr) loudFrames++; else loudFrames = Math.max(0, loudFrames - 1);
    if (loudFrames > 18) peakLoud = true; // 약 0.3초
    requestAnimationFrame(meterTick);
  }
  async function micDown() {
    if (!SR) { say('내 귀엔 안 들려. 채팅으로 해', '이 브라우저는 음성 인식 미지원'); return; }
    if (recOn || !playing || locked() || direct) return;
    await ensureMeter();
    rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    recText = ''; peakLoud = false; loudFrames = 0; levels = []; recOn = true;
    $('btnMic').classList.add('rec'); $('heardText').textContent = '🎙 듣는 중…'; $('heardParse').textContent = '';
    rec.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; recText = t; $('heardText').textContent = '🎙 “' + t + '”'; };
    rec.onerror = (e) => { if (e.error === 'not-allowed') say('마이크 권한이 없어. 채팅으로 해', '브라우저 마이크 권한을 확인'); };
    rec.onend = () => { finishRec(); };
    try { rec.start(); } catch (e) { recOn = false; }
    requestAnimationFrame(meterTick);
  }
  function micUp() { if (rec && recOn) { try { rec.stop(); } catch (e) { } } }
  function finishRec() {
    if (!recOn) return; recOn = false; $('btnMic').classList.remove('rec');
    if (levels.length) { const sorted = levels.slice().sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)]; if (!peakLoud) baseline = baseline == null ? med : baseline * 0.7 + med * 0.3; }
    if (recText.trim()) submit(recText, peakLoud);
    else $('heardText').textContent = '🎙 못 들었어요. 다시 눌러서 말해 보세요';
  }
  const mic = $('btnMic');
  mic.addEventListener('pointerdown', (e) => { e.preventDefault(); micDown(); });
  mic.addEventListener('pointerup', micUp); mic.addEventListener('pointerleave', micUp); mic.addEventListener('pointercancel', micUp);

  // ---------- 케이블 그리기 (2.5D 캔버스) ----------
  const cv = $('cv'), cx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, geo = null;
  const ANCH = { L: [0.14, 0.08], R: [0.86, 0.08], Y: [0.5, 0.38], A: [0.4, 0.57], B: [0.6, 0.74], '잭': [0.46, 0.93] };
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGeometry();
  }
  window.addEventListener('resize', resize);
  function proj(u, v) {
    const pad = Math.min(W, H) * 0.07;
    const w = Math.min(W - pad * 2, (H - pad * 2) * 2.1), h = H - pad * 2.2;
    const x0 = (W - w) / 2, y0 = pad * 1.1;
    return [x0 + w * (0.5 + (u - 0.5) * (0.8 + 0.2 * v)), y0 + h * v];
  }
  function catmull(pts, seg) {
    const out = []; seg = seg || 8;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function buildGeometry() {
    if (!st || !W) { geo = null; return; }
    const P = {}; for (const k in ANCH) P[k] = proj(ANCH[k][0], ANCH[k][1]);
    const S = Math.min(W, H);
    const strands = [], dots = [];
    // 본선: 잭 → B → A → Y
    strands.push(catmull([P['잭'], [P.B[0] + S * 0.03, (P['잭'][1] + P.B[1]) / 2], P.B, [P.A[0] + S * 0.05, (P.A[1] + P.B[1]) / 2], P.A, [P.A[0] - S * 0.02, (P.A[1] + P.Y[1]) / 2], P.Y]));
    // L·R 가닥 꼬임
    const tw = st.crossings.filter(c => c.type === 'twist');
    const M = proj(0.5, 0.17); const k = tw.length;
    const amp = S * 0.035;
    const Lp = [], Rp = [];
    const N = 24 + k * 6;
    for (let i = 0; i <= N; i++) {
      const t = i / N; const x = P.Y[0] + (M[0] - P.Y[0]) * t, y = P.Y[1] + (M[1] - P.Y[1]) * t;
      const off = k ? Math.sin(Math.PI * (k + 1) * t) * amp * (0.4 + 0.6 * Math.sin(Math.PI * t) + 0.3) : (t * amp * 0.8);
      Lp.push([x - off - (k ? 0 : t * amp), y]); Rp.push([x + off + (k ? 0 : t * amp), y]);
    }
    for (let j = 1; j <= k; j++) { const t = j / (k + 1); dots.push({ c: tw[j - 1], x: P.Y[0] + (M[0] - P.Y[0]) * t, y: P.Y[1] + (M[1] - P.Y[1]) * t }); }
    strands.push(catmull(Lp.concat([[M[0] - S * 0.12, M[1] - S * 0.02], P.L]).filter((_, i, a) => i % 2 === 0 || i === a.length - 1), 4));
    strands.push(catmull(Rp.concat([[M[0] + S * 0.12, M[1] - S * 0.02], P.R]).filter((_, i, a) => i % 2 === 0 || i === a.length - 1), 4));
    // 고리·매듭(컬)
    const curls = [];
    const perTag = {};
    const dirOf = (tag) => { const nb = { L: 'Y', R: 'Y', Y: 'A', A: 'Y', B: 'A', '잭': 'B' }[tag]; const a = P[tag], b = P[nb]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    st.crossings.forEach((c) => {
      if (c.type === 'twist') return;
      const tag = c.a; const n = perTag[tag] = (perTag[tag] || 0) + 1;
      const d = dirOf(tag); const nrm = [-d[1], d[0]];
      const r = S * (c.type === 'knot' ? 0.04 : 0.055);
      const along = (tag === 'L' || tag === 'R') ? 0.10 + 0.14 * (n - 1) : (n - 1) * 0.12 - 0.02;
      const base = P[tag];
      const L2 = Math.hypot(...[P[{ L: 'Y', R: 'Y', Y: 'A', A: 'Y', B: 'A', '잭': 'B' }[tag]][0] - base[0], P[{ L: 'Y', R: 'Y', Y: 'A', A: 'Y', B: 'A', '잭': 'B' }[tag]][1] - base[1]]);
      const px = base[0] + d[0] * L2 * Math.max(0, along) + (tag === '잭' ? 0 : 0), py = base[1] + d[1] * L2 * Math.max(0, along);
      const side = (n % 2 ? 1 : -1) * ((c.id % 3) === 0 ? -1 : 1);
      const nx = nrm[0] * side, ny = nrm[1] * side;
      const pts = [
        [px - d[0] * r * 1.3, py - d[1] * r * 1.3],
        [px + d[0] * r * 0.5 + nx * r * 0.9, py + d[1] * r * 0.5 + ny * r * 0.9],
        [px + nx * r * 2.1, py + ny * r * 2.1],
        [px - d[0] * r * 0.5 + nx * r * 0.9, py - d[1] * r * 0.5 + ny * r * 0.9],
        [px + d[0] * r * 1.3, py + d[1] * r * 1.3]
      ];
      const curve = catmull(pts, 10);
      curls.push({ c, curve, knot: c.type === 'knot', other: c.b ? P[c.b] : null, at: [px, py] });
      dots.push({ c, x: px + nx * r * 0.45, y: py + ny * r * 0.45 });
    });
    geo = { P, strands, curls, dots, M };
  }
  function strokeCable(pts, t, w) {
    if (!pts.length) return;
    const jit = wiggle > 0.01 ? wiggle : 0;
    const path = () => { cx.beginPath(); pts.forEach((p, i) => { const jx = jit ? Math.sin(t * 30 + i * 1.7) * 3 * jit : 0, jy = jit ? Math.cos(t * 27 + i * 1.3) * 3 * jit : 0; i ? cx.lineTo(p[0] + jx, p[1] + jy) : cx.moveTo(p[0] + jx, p[1] + jy); }); };
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.save(); cx.translate(3, 5); path(); cx.strokeStyle = 'rgba(60,40,20,.25)'; cx.lineWidth = w + 2; cx.stroke(); cx.restore();
    path(); cx.strokeStyle = '#8f8a94'; cx.lineWidth = w + 3; cx.stroke();
    path(); cx.strokeStyle = '#f6f4f0'; cx.lineWidth = w; cx.stroke();
    cx.save(); cx.translate(-1, -1); path(); cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.lineWidth = Math.max(1, w * 0.3); cx.stroke(); cx.restore();
  }
  function flag(x, y, label, hl) {
    cx.save();
    cx.strokeStyle = '#333'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x, y - 18); cx.stroke();
    cx.font = '900 14px Pretendard, sans-serif'; const tw = cx.measureText(label).width + 12;
    cx.fillStyle = hl || (label === '잭' ? '#8e7cc3' : '#7fd1b9'); roundRect(x - 2, y - 38, tw, 22, 6); cx.fill();
    cx.strokeStyle = '#141414'; cx.lineWidth = 2; cx.stroke();
    cx.fillStyle = '#111'; cx.fillText(label, x + 4, y - 22);
    cx.restore();
  }
  function roundRect(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function draw(t) {
    cx.clearRect(0, 0, W, H);
    if (!geo) return;
    const S = Math.min(W, H), w = Math.max(5, S * 0.02);
    // 러그 그림자 판
    const c0 = proj(0.5, 0.5); cx.fillStyle = 'rgba(120,90,60,.12)'; cx.beginPath(); cx.ellipse(c0[0], c0[1], W * 0.42, H * 0.46, 0, 0, Math.PI * 2); cx.fill();
    geo.strands.forEach(s => strokeCable(s, t, w));
    geo.curls.forEach(cu => {
      if (cu.other) { cx.save(); cx.setLineDash([4, 5]); cx.strokeStyle = 'rgba(255,77,77,.35)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(cu.at[0], cu.at[1]); cx.lineTo(cu.other[0], cu.other[1]); cx.stroke(); cx.restore(); }
      strokeCable(cu.curve, t, w);
      if (cu.knot) { cx.fillStyle = '#d8d2c8'; cx.strokeStyle = '#6f6a74'; cx.lineWidth = 2; cx.beginPath(); cx.arc(cu.at[0], cu.at[1], w * 1.4, 0, Math.PI * 2); cx.fill(); cx.stroke(); }
    });
    // 이어버드·잭
    const P = geo.P;
    [['L', -1], ['R', 1]].forEach(([k, s]) => { const p = P[k]; cx.save(); cx.translate(p[0], p[1]); cx.rotate(s * 0.4); cx.fillStyle = '#fbfbfb'; cx.strokeStyle = '#777'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(0, -8, 9, 13, 0, 0, Math.PI * 2); cx.fill(); cx.stroke(); cx.fillStyle = '#bbb'; cx.beginPath(); cx.arc(0, -16, 5, 0, Math.PI * 2); cx.fill(); cx.restore(); });
    { const p = P['잭']; cx.fillStyle = '#c9c9cf'; cx.strokeStyle = '#555'; cx.lineWidth = 2; roundRect(p[0] - 6, p[1] - 2, 12, 22, 3); cx.fill(); cx.stroke(); cx.fillStyle = '#e8c35a'; cx.fillRect(p[0] - 2, p[1] + 20, 4, 9); }
    // 교차 빨간 점
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    geo.dots.forEach((d, i) => {
      const dragging = direct && direct.drag && direct.drag.dot === d;
      let x = d.x, y = d.y;
      if (dragging) { x = direct.drag.x; y = direct.drag.y; const dist = Math.hypot(x - d.x, y - d.y); cx.strokeStyle = dist > 70 ? '#7fd1b9' : dist > 40 ? '#ffd43b' : '#fff'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(x, y); cx.stroke(); }
      const rr = (d.c.type === 'knot' ? 10 : 8) + pulse * 2 + (direct ? 3 : 0);
      cx.fillStyle = d.c.type === 'knot' ? 'rgba(255,212,59,.9)' : 'rgba(255,77,77,.9)';
      cx.beginPath(); cx.arc(x, y, rr, 0, Math.PI * 2); cx.fill();
      if (direct) { cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.stroke(); }
      cx.fillStyle = '#fff'; cx.font = '900 11px sans-serif'; cx.textAlign = 'center'; cx.fillText(d.c.type === 'knot' ? '매' : String(st.crossings.indexOf(d.c) + 1), x, y + 4); cx.textAlign = 'left';
    });
    // 이름표
    const hl = highlight && performance.now() < highlight.until ? highlight : null;
    flag(P.L[0] - 30, P.L[1] - 4, 'L', hl && hl.tag === 'L' && hl.color);
    flag(P.R[0] + 14, P.R[1] - 4, 'R', hl && hl.tag === 'R' && hl.color);
    flag(P.Y[0] + 12, P.Y[1] + 6, 'Y', hl && hl.tag === 'Y' && hl.color);
    flag(P.A[0] - 34, P.A[1] + 8, 'A', hl && hl.tag === 'A' && hl.color);
    flag(P.B[0] + 14, P.B[1] + 8, 'B', hl && hl.tag === 'B' && hl.color);
    flag(P['잭'][0] + 14, P['잭'][1] + 10, '잭', hl && hl.tag === '잭' && hl.color);
    if (st && st.pocket) { cx.fillStyle = 'rgba(20,20,20,.85)'; roundRect(W / 2 - 90, H / 2 - 20, 180, 40, 12); cx.fill(); cx.fillStyle = '#fff'; cx.font = '800 15px sans-serif'; cx.textAlign = 'center'; cx.fillText('👜 줄이 후드 주머니 속', W / 2, H / 2 + 5); cx.textAlign = 'left'; }
  }
  // 직접 하기 드래그
  function ptr(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  cv.addEventListener('pointerdown', (e) => {
    if (!direct || !geo) return;
    const [x, y] = ptr(e);
    let best = null, bd = 34;
    geo.dots.forEach(d => { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } });
    if (best) { direct.drag = { dot: best, x, y }; cv.setPointerCapture(e.pointerId); beep(250, 300, .05); }
  });
  cv.addEventListener('pointermove', (e) => { if (direct && direct.drag) { const [x, y] = ptr(e); direct.drag.x = x; direct.drag.y = y; } });
  const dragEnd = () => {
    if (!direct || !direct.drag) return;
    const d = direct.drag.dot, dist = Math.hypot(direct.drag.x - d.x, direct.drag.y - d.y);
    direct.drag = null;
    if (dist > 70 && direct.hands > 0 && st.crossings.includes(d.c)) {
      direct.hands--; const ev = E.handResolve(st, d.c); SFX.good(); pop(ev.loosened ? '매듭 풀림' : '교차 −1', '#ff8a3d');
      afterChange(ev);
      if (direct && direct.hands <= 0) { say('손 다 썼지? 이제 내 차례', '직접 하기 한도 끝'); setTimeout(() => endDirect(), 600); }
    }
  };
  cv.addEventListener('pointerup', dragEnd); cv.addEventListener('pointercancel', dragEnd);

  // ---------- 루프 ----------
  function loop(ts) {
    const dt = Math.min(0.1, (ts - lastT) / 1000) * SPEED; lastT = ts;
    if (playing && !paused && st && st.status === 'play') {
      st.t += dt;
      const left = Math.max(0, st.timeLimit - st.t);
      $('timer').textContent = fmt(left); $('timer2').textContent = fmt(left); $('hudTimer').classList.toggle('low', left < 20);
      if (direct) { if (now() >= direct.until) endDirect(); else updateHud(); }
      const L = locked();
      $('lock').style.display = L ? 'block' : 'none';
      if (L) $('lock').textContent = `${lockLabel || '잠깐…'} ${Math.ceil(lockUntil - now())}`;
      $('inp').disabled = L || !!direct; $('btnSend').disabled = L || !!direct;
      if (!L && $('cv').classList.contains('fling')) { }
      if (left <= 0) timeUp();
    } else $('lock').style.display = 'none';
    wiggle *= 0.92;
    draw(ts / 1000);
    requestAnimationFrame(loop);
  }
  resize(); requestAnimationFrame((ts) => { lastT = ts; loop(ts); });

  // ---------- 묶기 라운드 (신발끈) ----------
  const tcv = $('tcv'), tx = tcv.getContext('2d');
  let tie = null;
  const TSTEPS = [
    { label: '끈을 X자로 교차 — 왼쪽 끈 끝을 오른쪽 위 ○까지 끌기', type: 'drag', from: [0.3, 0.78], to: [0.64, 0.5] },
    { label: '교차한 끈을 밑으로 넣어 당기기 — ○까지 끌기', type: 'drag', from: [0.64, 0.5], to: [0.42, 0.6] },
    { label: '첫 번째 귀(고리) 만들기 — 왼쪽 위로 끌기', type: 'ear', from: [0.5, 0.56], to: [0.3, 0.38], key: 'ear1' },
    { label: '다른 끈으로 귀를 한 바퀴 감기 — 귀 주위를 빙 돌리기', type: 'circle', center: [0.36, 0.45] },
    { label: '구멍으로 밀어 두 번째 귀 만들기 — 오른쪽 위로 끌기', type: 'ear', from: [0.5, 0.56], to: [0.7, 0.38], key: 'ear2' },
    { label: '양쪽 귀 꽉 당기기 — 버튼을 누르고 초록 칸에서 떼기', type: 'hold' }
  ];
  function startTie() {
    hideAll(); show('scTie'); playing = false;
    $('tieResult').classList.add('hidden'); $('tieHold').classList.add('hidden');
    tie = { step: 0, t: 0, start: performance.now(), ears: {}, endErr: 0, tight: null, drag: null, angle: 0, lastAng: null, tipAt: 6, meter: 0, holding: false, done: false, trail: [] };
    $('tieBori').src = FACES.wait; $('tieBubble').textContent = `신발끈 좀 묶어 봐, ${call}. 내가 심사함`;
    tieResize(); tieStepUi(); requestAnimationFrame(tieLoop);
  }
  function tieResize() { const r = tcv.getBoundingClientRect(); tcv.width = r.width * DPR; tcv.height = r.height * DPR; tx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  window.addEventListener('resize', () => { if (tie) tieResize(); });
  function tp(p) { const r = tcv.getBoundingClientRect(); return [p[0] * r.width, p[1] * r.height]; }
  function tieStepUi() { const s = TSTEPS[tie.step]; $('tieStep').textContent = `${tie.step + 1}/6 · ${s.label}`; $('tieHold').classList.toggle('hidden', s.type !== 'hold'); }
  function tieLoop(ts) {
    if (!tie || $('scTie').classList.contains('hidden')) return;
    const r = tcv.getBoundingClientRect(), Wt = r.width, Ht = r.height;
    if (!tie.done) {
      tie.t = (performance.now() - tie.start) / 1000 * SPEED;
      const left = Math.max(0, 90 - tie.t); $('tieTimer').textContent = '⏱ ' + Math.ceil(left);
      if (tie.t > tie.tipAt) { tie.tipAt += 9; const tips = E.LINES.tieTip; $('tieBubble').textContent = tips[Math.floor(rng() * tips.length)]; }
      if (left <= 0) finishTie(true);
      if (tie.holding) { tie.meter += 0.016 * SPEED * tie.dir; if (tie.meter >= 1) { tie.meter = 1; tie.dir = -1; } if (tie.meter <= 0) { tie.meter = 0; tie.dir = 1; } }
    }
    tx.clearRect(0, 0, Wt, Ht);
    // 신발 (투박한 로우폴리)
    const S = Math.min(Wt, Ht);
    const sx = Wt / 2, sy = Ht * 0.62;
    tx.fillStyle = '#5b4a8a'; tx.beginPath(); tx.moveTo(sx - S * 0.42, sy + S * 0.18); tx.lineTo(sx - S * 0.36, sy - S * 0.08); tx.lineTo(sx - S * 0.1, sy - S * 0.2); tx.lineTo(sx + S * 0.2, sy - S * 0.14); tx.lineTo(sx + S * 0.44, sy + S * 0.04); tx.lineTo(sx + S * 0.46, sy + S * 0.18); tx.closePath(); tx.fill();
    tx.fillStyle = '#8e7cc3'; tx.beginPath(); tx.moveTo(sx - S * 0.36, sy - S * 0.08); tx.lineTo(sx - S * 0.1, sy - S * 0.2); tx.lineTo(sx + S * 0.12, sy - S * 0.15); tx.lineTo(sx - S * 0.05, sy + S * 0.02); tx.closePath(); tx.fill();
    tx.fillStyle = '#f2efe8'; tx.fillRect(sx - S * 0.44, sy + S * 0.16, S * 0.92, S * 0.06);
    tx.fillStyle = '#222'; for (let i = 0; i < 4; i++) { tx.beginPath(); tx.arc(sx - S * 0.14 + i * S * 0.07, sy - S * 0.1 + i * S * 0.03, 4, 0, Math.PI * 2); tx.fill(); }
    // 끈 상태
    const lace = (pts, col) => { tx.lineCap = 'round'; tx.lineJoin = 'round'; tx.strokeStyle = '#555'; tx.lineWidth = 9; tx.beginPath(); pts.forEach((p, i) => i ? tx.lineTo(...tp(p)) : tx.moveTo(...tp(p))); tx.stroke(); tx.strokeStyle = col || '#fff'; tx.lineWidth = 6; tx.stroke(); };
    const K = [0.5, 0.56];
    if (tie.step < 1) { lace([[0.46, 0.6], [0.36, 0.7], [0.3, 0.78]]); lace([[0.54, 0.6], [0.64, 0.7], [0.7, 0.78]]); }
    else if (tie.step < 2) { lace([[0.46, 0.6], [0.56, 0.54], [0.64, 0.5]]); lace([[0.54, 0.6], [0.44, 0.54], [0.36, 0.5]]); }
    else { lace([[0.46, 0.6], K, [0.42, 0.66], [0.38, 0.76]]); lace([[0.54, 0.6], K, [0.58, 0.66], [0.62, 0.76]]); }
    const ear = (key, dirx) => { const e = tie.ears[key]; if (e == null) return; const sz = 0.06 + 0.16 * e; const c = tp([K[0] + dirx * sz, K[1] - sz * 0.9]); tx.strokeStyle = '#555'; tx.lineWidth = 9; tx.beginPath(); tx.ellipse(c[0], c[1], sz * Wt * 0.55, sz * Ht * 0.5, dirx * -0.5, 0, Math.PI * 2); tx.stroke(); tx.strokeStyle = '#fff'; tx.lineWidth = 6; tx.stroke(); };
    ear('ear1', -1); ear('ear2', 1);
    if (tie.step >= 4) { const k = tp(K); tx.fillStyle = '#fff'; tx.strokeStyle = '#555'; tx.lineWidth = 3; tx.beginPath(); tx.arc(k[0], k[1], 10, 0, Math.PI * 2); tx.fill(); tx.stroke(); }
    // 가이드
    if (!tie.done) {
      const s = TSTEPS[tie.step];
      tx.setLineDash([8, 8]); tx.strokeStyle = '#ff8a3d'; tx.lineWidth = 4;
      if (s.type === 'drag' || s.type === 'ear') { const a = tp(s.from), b = tp(s.to); tx.beginPath(); tx.moveTo(...a); tx.lineTo(...b); tx.stroke(); tx.setLineDash([]); tx.fillStyle = '#ff8a3d'; tx.beginPath(); tx.arc(...a, 14, 0, Math.PI * 2); tx.fill(); tx.strokeStyle = '#ff8a3d'; tx.beginPath(); tx.arc(...b, 18, 0, Math.PI * 2); tx.stroke(); }
      if (s.type === 'circle') { const c = tp(s.center); tx.beginPath(); tx.arc(c[0], c[1], S * 0.12, 0, Math.PI * 2); tx.stroke(); tx.setLineDash([]); tx.fillStyle = '#fff'; tx.font = '900 16px sans-serif'; tx.textAlign = 'center'; tx.fillText(`${Math.min(360, Math.round(Math.abs(tie.angle) * 180 / Math.PI))}°`, c[0], c[1] + 5); tx.textAlign = 'left'; }
      tx.setLineDash([]);
      if (s.type === 'hold') { const bw = Wt * 0.6, bx = (Wt - bw) / 2, by = Ht * 0.1; tx.fillStyle = '#333'; tx.fillRect(bx, by, bw, 18); tx.fillStyle = '#7fd1b9'; tx.fillRect(bx + bw * 0.6, by, bw * 0.25, 18); tx.fillStyle = '#ff4d4d'; tx.fillRect(bx + bw * 0.92, by, bw * 0.08, 18); tx.fillStyle = '#fff'; tx.fillRect(bx + bw * tie.meter - 3, by - 4, 6, 26); }
      if (tie.drag) { tx.strokeStyle = '#fff'; tx.lineWidth = 6; tx.beginPath(); tie.trail.forEach((p, i) => i ? tx.lineTo(p[0], p[1]) : tx.moveTo(p[0], p[1])); tx.stroke(); }
    }
    if (tie.walk != null) { tie.walk += 0.05 * SPEED; const step = Math.min(10, Math.floor(tie.walk)); tcv.style.transform = `translateY(${-Math.abs(Math.sin(tie.walk * Math.PI)) * 14}px) rotate(${Math.sin(tie.walk * Math.PI) * 3}deg)`; $('tieStep').textContent = `👟 걷기 테스트 ${step}/10`; if (tie.walk >= 10) { tcv.style.transform = ''; tie.walk = null; showTieResult(); } }
    requestAnimationFrame(tieLoop);
  }
  function tptr(e) { const r = tcv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  tcv.addEventListener('pointerdown', (e) => {
    if (!tie || tie.done) return; const s = TSTEPS[tie.step]; const p = tptr(e);
    if (s.type === 'drag' || s.type === 'ear') { const a = tp(s.from); if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 44) { tie.drag = true; tie.trail = [p]; tcv.setPointerCapture(e.pointerId); } }
    if (s.type === 'circle') { tie.drag = true; tie.trail = [p]; tie.lastAng = null; tcv.setPointerCapture(e.pointerId); }
  });
  tcv.addEventListener('pointermove', (e) => {
    if (!tie || !tie.drag) return; const p = tptr(e); tie.trail.push(p); if (tie.trail.length > 60) tie.trail.shift();
    const s = TSTEPS[tie.step];
    if (s.type === 'circle') { const c = tp(s.center); const a = Math.atan2(p[1] - c[1], p[0] - c[0]); if (tie.lastAng != null) { let d = a - tie.lastAng; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; tie.angle += d; } tie.lastAng = a; if (Math.abs(tie.angle) >= Math.PI * 1.8) { tie.drag = false; nextTie(); } }
  });
  tcv.addEventListener('pointerup', (e) => {
    if (!tie || !tie.drag) return; tie.drag = false; const s = TSTEPS[tie.step]; const p = tptr(e);
    if (s.type === 'drag') { const b = tp(s.to); const err = Math.hypot(p[0] - b[0], p[1] - b[1]); if (err < 90) { if (tie.step === 0) tie.endErr = Math.min(1, err / 90); nextTie(); } else $('tieBubble').textContent = '어디로 가는 거야? ○까지!'; }
    if (s.type === 'ear') { const a = tp(s.from), b = tp(s.to); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const got = Math.hypot(p[0] - a[0], p[1] - a[1]); if (got < 25) return; tie.ears[s.key] = Math.max(0.1, Math.min(1.6, got / L)) / 1.6; nextTie(); if (s.key === 'ear2') { const d = Math.abs(tie.ears.ear1 - tie.ears.ear2); $('tieBubble').textContent = d > 0.15 ? '귀가 짝짝이야' : '오 귀 크기 맞췄네?'; } }
  });
  function nextTie() { beep(500, 800, .1); tie.step++; tie.angle = 0; if (tie.step >= TSTEPS.length) return; tieStepUi(); }
  const hold = $('tieHold');
  hold.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!tie || tie.done) return; tie.holding = true; tie.meter = 0; tie.dir = 1; });
  const holdUp = () => { if (!tie || !tie.holding) return; tie.holding = false; const m = tie.meter; tie.tight = m > 0.92 ? 0.35 : m >= 0.6 && m <= 0.85 ? 1 - Math.abs(m - 0.72) * 1.2 : Math.max(0.1, 0.7 - Math.abs(m - 0.72) * 1.5); $('tieBubble').textContent = m > 0.92 ? '끊어질 뻔했잖아!!' : m < 0.6 ? '헐렁한데?' : '오 꽉 조였다'; finishTie(false); };
  hold.addEventListener('pointerup', holdUp); hold.addEventListener('pointerleave', holdUp); hold.addEventListener('pointercancel', holdUp);
  function finishTie(timeout) {
    tie.done = true; $('tieHold').classList.add('hidden');
    tie.secs = tie.t;
    if (timeout) { tie.tight = tie.tight || 0.05; tie.ears.ear1 = tie.ears.ear1 || 0; tie.ears.ear2 = tie.ears.ear2 || 1; }
    tie.walk = 0; $('tieBubble').textContent = '자, 10걸음 걸어 본다?';
  }
  function showTieResult() {
    const j = E.judgeTie({ secs: tie.secs, earDiff: Math.abs((tie.ears.ear1 || 0) - (tie.ears.ear2 || 0)) / Math.max(0.01, Math.max(tie.ears.ear1 || 0, tie.ears.ear2 || 0)), endDiff: tie.endErr, tight: tie.tight || 0, rng });
    $('tieBori').src = j.score >= 5 ? FACES.happy : j.score >= 3 ? FACES.wait : FACES.pout;
    $('tieBubble').textContent = j.line;
    const box = $('tieResult');
    box.innerHTML = `<h2>보리 심사 ${j.score}/5</h2><div style="font-size:28px;color:#ffd43b">${'★'.repeat(j.score)}${'☆'.repeat(5 - j.score)}</div><table>${j.parts.map(([a, b]) => `<tr><td>${a}</td><td style="text-align:right">${b ? '+' + b : '0'}</td></tr>`).join('')}<tr><td>걸린 시간</td><td style="text-align:right">${Math.round(tie.secs)}초</td></tr></table><p>“${j.line}”</p><button class="btn" id="tieAgain">다시</button><button class="btn ghost" id="tieMenu">메뉴</button>`;
    box.classList.remove('hidden');
    $('tieAgain').onclick = startTie; $('tieMenu').onclick = () => show('scSelect');
    window.__tieResult = j;
  }

  // ---------- 테스트 훅 ----------
  window.__bori = { state: () => st && { status: st.status, crossings: st.crossings.map(c => ({ ...c })), mood: st.mood, t: st.t, locked: locked(), direct: !!direct, warnings: st.warnings }, submit, ready, startRound, beginDirect, endDirect, dots: () => geo ? geo.dots.map(d => ({ x: d.x, y: d.y, type: d.c.type })) : [] };
})();
