/* 동생아, 그거 아니야 — 보리 룰 엔진 (브라우저·Node 공용)
 * 페이퍼 프로토타입 키트 3장 규칙을 코드로 옮기고, 시뮬레이션으로 튜닝한 값(rules.json)을 씁니다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoriEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 기본 룰셋 (시뮬레이션 전 = 페이퍼 키트 원본 값) ----------
  const PAPER_RULES = {
    version: 'paper-v1',
    mood: { start: 6, min: 0, max: 10, yell: -2, direct: -2, hardWarn: -1, repeatAnnoy: -1, polite: 1, politeCap: 3, clear: 2, carryMin: 5 },
    // 기분 구간별 오해 확률 [명확(태그+동작+기준), 보통(태그+동작), 애매]. 페이퍼 키트는 2단계라 보통=명확과 같은 값
    miss: {
      good: [0, 0, 3 / 6],
      mid: [1 / 6, 1 / 6, 4 / 6],
      low: [2 / 6, 2 / 6, 5 / 6]
    },
    refuseLow: 1 / 6,
    pityAfter: 99,            // 명확·보통 지시 연속 오해 후 보정 (페이퍼: 없음)
    alwaysMissUpDownWithTag: true, // 페이퍼: 기준 없는 위/아래는 태그가 있어도 항상 오해
    sulkSec: 10, slowSec: 10, freezeSec: 10, pocketSec: 3,
    breakAt: 3,
    longChars: 60, longSentences: 3, maxActions: 3,
    direct: { sec: 15, handCap: 99, secPerCrossing: 4 },
    // 오해 카드별 교차 증가량
    cardDelta: { 1: 2, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 1, 11: 0, 12: 1, 13: 0, 14: 0, 15: 1, 16: 0, 17: 0, 18: 0, 19: 0, 20: 1, 21: 0, 99: 1 },
    pronounDeltaChance: 0.5,
    timeLimit: { easy: 240, medium: 300, hard: 240 },
    actSec: 3, missLockSec: 2
  };

  // ---------- 오해 카드 ----------
  const CARDS = {
    1: { verb: '왼쪽/오른쪽', act: '자기 기준으로 반대쪽을 건드림', line: '네가 왼쪽이라며!!', anim: 'fling' },
    2: { verb: '위/아래', act: '줄 전체를 머리 위로 번쩍', line: '위로 했는데?', anim: 'lift' },
    3: { verb: '그거/저거', act: '자기 쪽에 가까운 엉뚱한 데를 잡음', line: '이거? …아님 말고', anim: 'grab' },
    4: { verb: '빼', act: '자기 귀에서 이어폰 빼는 시늉', line: '뺐는데? 원래 안 꼈는데', anim: 'ear' },
    5: { verb: '넣어', act: '줄을 후드 주머니에 넣음', line: '넣었는데?', anim: 'pocket' },
    6: { verb: '돌려', act: '자기가 제자리에서 한 바퀴 돎', line: '돌았어. 어지러워', anim: 'spin' },
    7: { verb: '당겨', act: '한쪽 끝만 잡고 자기 쪽으로 쭉', line: '당기라며!', anim: 'pull' },
    8: { verb: '세게', act: '온 힘으로 양 끝을 잡아당김', line: '세게 했잖아!!', anim: 'pull' },
    9: { verb: '살살', act: '거의 안 움직임 (슬로모션)', line: '살~살~ 하는 중', anim: 'slow' },
    10: { verb: '감아', act: '줄을 자기 손목에 감음', line: '팔찌 됐다', anim: 'wrap' },
    11: { verb: '풀어', act: '자기 후드 끈을 풂', line: '풀었어. 뭐?', anim: 'hood' },
    12: { verb: '흔들어', act: '고개를 좌우로 흔듦', line: '흔들었는데 안 풀려', anim: 'shake' },
    13: { verb: '잡아', act: '플레이어 손을 잡음', line: '잡았다~', anim: 'hand' },
    14: { verb: '올려/내려', act: '줄을 옆 상자 위로 올림', line: '올렸어', anim: 'lift' },
    15: { verb: '빨리', act: '아무 데나 두 배속으로 막 만짐', line: '빨리 했잖아', anim: 'fast' },
    16: { verb: '멈춰', act: '진짜 얼음', line: '…(얼음)', anim: 'freeze' },
    17: { verb: '통과/고리에 넣어', act: '자기 손가락을 고리에 넣음', line: '손가락 통과!', anim: 'finger' },
    18: { verb: '펴', act: '손바닥을 쫙 펴서 보여 줌', line: '폈어 ✋', anim: 'palm' },
    19: { verb: '그대로/계속', act: '방금 한 동작을 한 번 더', line: '한 번 더?', anim: 'repeat' },
    20: { verb: '반대로', act: '되돌린 뒤 반대로 한 번 더', line: '반대로 했는데 왜?', anim: 'fast' },
    21: { verb: '꼬인 데', act: '교차 하나를 가리키기만 함', line: '여기? 여기 꼬였네', anim: 'point' },
    99: { verb: '(카드 없음)', act: '반대 방향으로 수행', line: '반대로 하라는 거 아니었어?', anim: 'fast' }
  };
  const VERB_CARD = { '빼': 4, '꺼내': 99, '넣어': 5, '돌려': 6, '당겨': 7, '감아': 10, '풀어': 11, '흔들어': 12, '잡아': 13, '올려': 14, '내려': 14, '멈춰': 16, '펴': 18, '그대로': 19, '반대로': 20, '꼬인데': 21, '통과': 17 };

  // ---------- 대사 카드 ----------
  const LINES = {
    miss: ['네가 왼쪽이라며!!', '했는데?', '말을 똑바로 해야지', '내 잘못 아님', '이게 맞는데?', '시킨 대로 했거든?'],
    good: ['오 된다?', '봤지? 내가 잘해', '감다살~', '폼 미쳤다', '이 정도는 기본', '오 하나 풀렸다!'],
    noop: ['했는데? 그대로네', '시킨 대로 했어. 안 풀리는데?', '거기 안 꼬였거든?', '이거 맞아?'],
    yell: ['왜 소리 질러??', '귀 아파. 안 해.', '엄마한테 이른다', '…(팔짱, 10초 삐짐)', '소리 지르면 더 못 해', '흥. 무서워서 못 하겠네'],
    huh: ['흥.', '흥!', '…흥.', '흥흥.', '(고개 돌리고) 흥', '흐응.'],
    unknown: ['뭐라는 거야?', '그게 뭔데', '다시 말해 봐', '그게 어딘데? 이름 있잖아'],
    long: ['길어.', '하나만 말해', '길다고.'],
    refuse: ['싫어.', '안 해.', '귀찮아.'],
    hard: ['야야야 살살!!', '끼익 소리 났어', '줄 비명 지른다'],
    broke: ['……화 안 났어.', '이어폰 사망…', '새 거 사 줘', '이건 네 탓이다'],
    direct: ['치, 그럼 네가 해', '결국 네가 하네', '나 못 하는 거 아니거든?'],
    directEnd: ['이제 와서?', '거봐 어렵지?', '내 차례야'],
    polite: ['…알았어', '부탁이면 해 줄게', '흐흥, 좀 하네', '오, 착한 말 했다', '그래 그렇게 말해야지', '한 번만 해 준다'],
    clear: ['이왜진… 풀렸어', '내가 다 했다', '아이스크림 사 줘', '역시 나야', '말로 하니까 되잖아', '다음엔 더 꼬아 놓을게'],
    question: ['몰라, 네가 말해', '나한테 묻지 마', '네가 시키는 거잖아'],
    leave: ['나 안 해.', '혼자 해. 나 간다.'],
    annoy: ['아 알았다고', '같은 말 좀 그만해'],
    pocket: ['주머니에 있는데?', '꺼내 달라고 해야지'],
    sulking: ['…(팔짱)', '…', '(못 들은 척)'],
    tieTip: ['그거 나비 아니고 나방인데?', '귀가 짝짝이야', '그렇게 하면 풀려', '나라면 벌써 했다', '아 답답해…', '선물 받는 사람 불쌍해', '오 좀 하네?', '끝? 진짜 끝?']
  };

  const TAGS = ['L', 'R', 'Y', 'A', 'B', '잭'];
  const TAG_RE = [
    ['L', /(^|[^A-Za-z])[Ll](?![A-Za-z])|엘(?=\s|을|이|은|의|에|태그|$)/g],
    ['R', /(^|[^A-Za-z])[Rr](?![A-Za-z])|알(?=\s|을|이|은|의|에|태그|$)/g],
    ['Y', /(^|[^A-Za-z])[Yy](?![A-Za-z])|와이|갈림(?:길|목|점)?/g],
    ['A', /(^|[^A-Za-z])[Aa](?![A-Za-z])|에이(?=\s|를|가|는|의|에|태그|고리|$)/g],
    ['B', /(^|[^A-Za-z])[Bb](?![A-Za-z])|비(?=\s|를|가|는|의|에|태그|고리|$)/g],
    ['잭', /잭|플러그|단자/g]
  ];
  const VERB_RE = [
    ['꺼내', /꺼내/], ['빼', /빼|뽑/], ['통과', /통과/], ['넣어', /넣/], ['돌려', /돌려|돌리|회전/],
    ['당겨', /당겨|당기|땡겨/], ['감아', /감아|감기|감어|감으/], ['풀어', /풀어|풀기|풀으|풀자|풀면/],
    ['흔들어', /흔들/], ['잡아', /잡아|잡고|잡어|잡으|잡$/], ['올려', /올려|올리/], ['내려', /내려|내리/],
    ['멈춰', /잠깐|기다려|멈춰|스톱|그만/], ['펴', /펴|펼/], ['그대로', /그대로|맞아|계속/],
    ['반대로', /반대로/], ['꼬인데', /꼬인\s?(데|곳)|엉킨\s?(데|곳)/]
  ];
  const ACTION_VERBS = ['꺼내', '빼', '통과', '넣어', '돌려', '당겨', '감아', '풀어', '흔들어', '잡아', '올려', '내려', '펴'];
  const META_VERBS = ['그대로', '반대로', '멈춰', '꼬인데'];

  function findTags(seg) {
    const out = [];
    for (const [tag, re] of TAG_RE) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(seg))) {
        const pre = m[1] || '';
        const idx = m.index + pre.length;
        out.push({ tag, idx, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    // '왼쪽 이어폰' 류: 기준이 있으면 태그로 해석 (내 왼쪽 = L, 네 왼쪽 = R)
    const ear = /(내|오빠|언니|나의|네|너|니|너의|보리)\s*(왼쪽|오른쪽)\s*(이어폰|이어버드|귀)/g; let m;
    while ((m = ear.exec(seg))) {
      const mine = /내|오빠|언니|나의/.test(m[1]);
      const left = m[2] === '왼쪽';
      out.push({ tag: (mine === left) ? 'L' : 'R', idx: m.index, end: m.index + m[0].length, earRef: true });
    }
    out.sort((a, b) => a.idx - b.idx);
    return out;
  }

  function splitActions(text) {
    return text.split(/그리고|그\s?다음(?:에)?|다음에|하고\s?나서|고\s?나서|(?<=[가-힣])고\s+(?=\S)|[,，]\s*|\s+그리고\s+/).map(s => (s || '').trim()).filter(Boolean);
  }

  function parse(text, opts) {
    opts = opts || {};
    const raw = String(text || '').trim();
    const t = raw.replace(/\s+/g, ' ');
    const p = { raw, empty: !t, tags: [], target: null, ref: null, pronoun: false, dir: null, dirRef: false, verbs: [], verb: null, meta: null,
      mods: { hard: false, soft: false, fast: false }, actions: 0, sentences: 0, long: false, polite: false, praise: false,
      yell: !!opts.loud, direct: false, question: false, earUnref: null };
    if (!t) return p;
    if (/내가\s?할게|내가\s?해|줘\s?봐|비켜|이리\s?줘|내놔/.test(t)) p.direct = true;
    if (/!{2,}|야+!|아\s?진짜|왜\s?못\s?해|답답해|으아+|악+!/.test(t)) p.yell = true;
    if (/제발|부탁|줄래|주세요|고마워|고맙|잘했|잘한다|잘하네|최고|착하|천재|멋지/.test(t)) p.polite = true;
    if (/잘했|잘한다|잘하네|최고|천재|멋지|오 좋아/.test(t)) p.praise = true;
    p.sentences = t.split(/[.?!。]+/).map(s => s.trim()).filter(Boolean).length;

    // 동작 단위로 나누기
    const segs = splitActions(t);
    const actSegs = segs.filter(s => VERB_RE.some(([k, re]) => (ACTION_VERBS.includes(k) || META_VERBS.includes(k)) && re.test(s)));
    p.actions = actSegs.length;
    p.long = p.sentences >= RULES.longSentences || t.length > RULES.longChars || p.actions >= RULES.maxActions;
    const seg = actSegs.length ? actSegs[actSegs.length - 1] : t; // ⑤ 마지막 동작만
    // 앞 동작 구간의 태그도 대상 후보로 (예: "L 잡고 위로 빼")
    const ctx = actSegs.length > 1 ? actSegs.slice(0, -1).join(' ') + ' ' + seg : seg;

    for (const [k, re] of VERB_RE) if (re.test(seg)) p.verbs.push(k);
    p.verb = p.verbs.find(v => ACTION_VERBS.includes(v)) || null;
    p.meta = p.verbs.find(v => META_VERBS.includes(v)) || null;
    if (!p.verb && p.meta === '그대로') p.verb = '그대로';
    p.mods.hard = /세게|힘껏|쎄게|확\s/.test(seg);
    p.mods.soft = /살살|천천히|조심/.test(seg);
    p.mods.fast = /빨리|얼른|후딱|빨랑/.test(seg);

    let tags = findTags(seg);
    let tsrc = seg;
    if (!tags.length) { tags = findTags(t); tsrc = t; }
    p.tags = tags.map(x => x.tag);
    const isRefAt = (s, x) => /^\s*(태그)?\s*(쪽|고리|밑|아래|위|에서|에|으로|로|안|옆|사이|랑|와|과)/.test(s.slice(x.end));
    const tseg = tsrc;
    const objs = tags.filter(x => /^\s*(태그)?\s*(을|를|이|가|은|는)?(\s|$)/.test(tseg.slice(x.end)) && !isRefAt(tseg, x));
    const tgt = objs[0] || tags.find(x => !isRefAt(tseg, x)) || tags[0];
    if (tgt) { p.target = tgt.tag; const r = tags.find(x => x !== tgt && x.tag !== tgt.tag); if (r) p.ref = r.tag; }
    if (tgt && isRefAt(tseg, tgt) && ctx !== seg) { const ct = findTags(ctx).filter(x => !isRefAt(ctx, x) && x.tag !== tgt.tag); if (ct.length) { p.ref = tgt.tag; p.target = ct[0].tag; } }

    // 방향
    const dm = seg.match(/왼쪽|오른쪽|왼편|오른편|위|아래|밑/);
    if (dm) {
      p.dir = /왼/.test(dm[0]) ? '왼쪽' : /오른/.test(dm[0]) ? '오른쪽' : dm[0] === '위' ? '위' : '아래';
      const before = seg.slice(0, dm.index);
      const refByTag = /(L|R|Y|A|B|잭|플러그|에이|와이|엘|알|비)\s*(태그)?\s*(의\s*)?(고리\s*)?$/i.test(before);
      const refByPerson = /(네|너|니|너의|보리|내|나의|오빠|언니|창문|티비|TV|소파|탁자|화면)\s*(의\s*)?$/.test(before);
      const ear = tags.some(x => x.earRef);
      p.dirRef = refByTag || refByPerson || ear;
      if (!p.dirRef && (p.dir === '왼쪽' || p.dir === '오른쪽') && /이어폰|이어버드|귀/.test(seg)) p.earUnref = p.dir === '왼쪽' ? 'L' : 'R';
    }
    p.pronoun = !p.target && /그거|저거|이거|그걸|이걸|저걸|그것|이것|저것|거기|여기|저기|요거|고거/.test(seg);
    p.question = !p.verb && !p.meta && (/[?？]$|어떻게|뭐 해|몇 개|어디/.test(t));
    return p;
  }

  // ---------- 엉킴 ----------
  let RULES = JSON.parse(JSON.stringify(PAPER_RULES));
  function setRules(r) { RULES = deepMerge(JSON.parse(JSON.stringify(PAPER_RULES)), r || {}); return RULES; }
  function deepMerge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]); else a[k] = b[k]; } return a; }

  const SOLVE = { hook: ['빼', '꺼내'], over: ['빼', '올려'], under: ['넣어', '통과'], twist: ['돌려', '풀어'], knot: ['당겨', '풀어'] };
  const BATCHIM = { L: 1, R: 1, '잭': 1 };
  const subj = (t) => t + (BATCHIM[t] ? '이' : '가');
  const obj = (t) => t + (BATCHIM[t] ? '을' : '를');
  const DESC = {
    hook: (c) => `${subj(c.a)} ${c.b} 고리에 걸림`,
    over: (c) => `${subj(c.a)} ${c.b} 위에 올라탐`,
    under: (c) => `${subj(c.a)} ${c.b} 밑으로 가야 함`,
    twist: (c) => `L·R 가닥이 꼬임`,
    knot: (c) => `${c.a}에 매듭`
  };
  const HINT = { hook: '빼', over: '빼/올려', under: '밑으로 넣어', twist: '돌려', knot: '살살 당겨' };
  function josa(tag) { return tag; }

  function recipe(level, rng) {
    rng = rng || Math.random;
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const L = [];
    const tw = (n) => { for (let i = 0; i < n; i++) L.push({ type: 'twist', a: pick(['L', 'R']), b: 'Y' }); };
    // 페이퍼 키트 2장 엉킴 레시피를 그대로 옮김 (태그 일부는 매번 살짝 섞음)
    if (level === 'easy') {
      tw(2); L.push({ type: 'hook', a: '잭', b: 'B' }); L.push({ type: 'over', a: '잭', b: pick(['L', 'R']) });
    } else if (level === 'medium') {
      tw(2); L.push({ type: 'hook', a: '잭', b: 'A' }); L.push({ type: 'hook', a: pick(['L', 'R']), b: 'A' });
      L.push({ type: 'over', a: 'B', b: '잭' }); L.push({ type: 'under', a: pick(['R', 'L']), b: 'B' });
      L.push({ type: 'knot', a: '잭' });
    } else {
      tw(2); L.push({ type: 'hook', a: '잭', b: 'A' }); L.push({ type: 'hook', a: 'L', b: 'A' });
      L.push({ type: 'over', a: 'B', b: '잭' }); L.push({ type: 'under', a: 'R', b: 'B' });
      L.push({ type: 'knot', a: '잭' }); L.push({ type: 'knot', a: 'R' });
      tw(2); L.push({ type: 'over', a: 'Y', b: '잭' });
    }
    L.forEach((c, i) => c.id = i + 1);
    return L;
  }
  function randomCrossing(st, rng) {
    const types = ['hook', 'over', 'under', 'hook', 'over'];
    const type = types[Math.floor(rng() * types.length)];
    let a, b; do { a = TAGS[Math.floor(rng() * TAGS.length)]; b = TAGS[Math.floor(rng() * TAGS.length)]; } while (a === b);
    return { type, a, b, id: ++st.nextId, added: true };
  }

  function newRound(level, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const cr = recipe(level, rng);
    const st = {
      level, rng, crossings: cr, nextId: cr.length, mood: opts.mood != null ? opts.mood : RULES.mood.start,
      politeGain: 0, warnings: 0, sulkUntil: -1, pocket: false, lastRefused: false, clearMissStreak: 0,
      lastParsed: null, repeatCount: 0, lastText: '', directUses: 0, firstDirectAt: null, voiceOnly: true,
      t: 0, timeLimit: RULES.timeLimit[level], status: 'play',
      stats: { instr: 0, misses: 0, alwaysMiss: 0, diceMiss: 0, yells: 0, solvedVoice: 0, solvedHand: 0, refusals: 0, longs: 0, unknown: 0, noop: 0, added: 0, missTimes: [], maxClearStreak: 0, moodTrace: [] },
      used: {}
    };
    st.startCount = countAll(st);
    return st;
  }
  function crossCount(st) { return st.crossings.filter(c => c.type !== 'knot').length; }
  function knotCount(st) { return st.crossings.filter(c => c.type === 'knot').length; }
  function countAll(st) { return st.crossings.length; }
  function band(m) { return m >= 8 ? 'good' : m >= 4 ? 'mid' : 'low'; }
  function line(st, key) {
    const arr = LINES[key]; st.used[key] = (st.used[key] || 0); const s = arr[st.used[key] % arr.length]; st.used[key]++; return s;
  }
  function addMood(st, d) { st.mood = Math.max(RULES.mood.min, Math.min(RULES.mood.max, st.mood + d)); }

  function findMatch(st, target, verb, mods) {
    if (!target || !verb) return null;
    return st.crossings.find(c => {
      if (!SOLVE[c.type].includes(verb)) return false;
      if (c.type === 'twist') return ['L', 'R', 'Y'].includes(target);
      return c.a === target;
    }) || null;
  }
  function resolve(st, c, how) {
    if (c.type === 'knot') { // 매듭은 풀리면 걸림 교차 하나로 바뀜
      const i = st.crossings.indexOf(c);
      const nc = { type: 'hook', a: c.a, b: c.a === '잭' ? 'A' : 'Y', id: ++st.nextId, fromKnot: true };
      st.crossings.splice(i, 1, nc);
      return { loosened: c, became: nc };
    }
    st.crossings.splice(st.crossings.indexOf(c), 1);
    if (how === 'voice') st.stats.solvedVoice++; else st.stats.solvedHand++;
    return { removed: c };
  }
  function addCrossings(st, n) {
    const added = [];
    for (let i = 0; i < n; i++) { const c = randomCrossing(st, st.rng); st.crossings.push(c); added.push(c); }
    st.stats.added += n; return added;
  }

  // 한 번의 '말 덩어리' 처리. now = 라운드 경과 초
  function step(st, p, now) {
    const R = RULES, ev = { kind: null, line: '', face: 'wait', card: null, delta: 0, lockSec: 0, removed: null, added: [], loosened: null, moodDelta: 0 };
    if (now == null) now = st.t;
    const m0 = st.mood;
    const done = (e) => {
      e.moodDelta = st.mood - m0; st.stats.moodTrace.push([Math.round(now), st.mood]);
      if (st.status === 'play' && st.mood <= 0) { st.status = 'leave'; e.kind = 'leave'; e.line = line(st, 'leave'); e.face = 'sulk'; }
      checkEnd(st, e); return e;
    };
    if (st.status !== 'play') return done(Object.assign(ev, { kind: 'over' }));
    if (p.empty) return done(Object.assign(ev, { kind: 'empty' }));
    if (p.direct) return done(Object.assign(ev, { kind: 'direct-request' }));
    st.stats.instr++;
    if (now < st.sulkUntil) return done(Object.assign(ev, { kind: 'sulking', line: line(st, 'sulking'), face: 'sulk' }));
    // ① 소리
    if (p.yell) {
      st.stats.yells++; addMood(st, R.mood.yell); st.sulkUntil = now + R.sulkSec;
      return done(Object.assign(ev, { kind: 'yell', line: line(st, 'yell'), face: 'sulk', lockSec: R.sulkSec }));
    }
    // ② 길이
    if (p.long) { st.stats.longs++; return done(Object.assign(ev, { kind: 'long', line: line(st, 'long'), face: 'pout', lockSec: 1 })); }
    // ③ 공손
    let politeLine = null;
    if (p.polite && st.politeGain < R.mood.politeCap) { st.politeGain++; addMood(st, R.mood.polite); politeLine = line(st, 'polite'); }
    // 같은 지시 짜증 반복
    if (p.raw === st.lastText) { st.repeatCount++; } else st.repeatCount = 0; st.lastText = p.raw;
    if (st.repeatCount >= 2) { st.repeatCount = 0; addMood(st, R.mood.repeatAnnoy); }
    // ④ 기분
    if (st.mood <= 0) { st.status = 'leave'; return done(Object.assign(ev, { kind: 'leave', line: line(st, 'leave'), face: 'sulk' })); }
    const huff = band(st.mood) === 'low';
    // 주머니 상태
    if (st.pocket) {
      if (p.verb === '꺼내' || /꺼내/.test(p.raw)) { st.pocket = false; return done(Object.assign(ev, { kind: 'unpocket', line: '꺼냈어. 됐지?', face: 'pout', lockSec: R.pocketSec })); }
      return done(Object.assign(ev, { kind: 'pocket', line: line(st, 'pocket'), face: 'smug', lockSec: 1 }));
    }
    // ⑥ 동사
    if (!p.verb && !p.meta) {
      if (p.question) return done(Object.assign(ev, { kind: 'question', line: line(st, 'question'), face: 'pout' }));
      if (politeLine) return done(Object.assign(ev, { kind: 'polite', line: politeLine, face: 'happy' }));
      st.stats.unknown++; return done(Object.assign(ev, { kind: 'unknown', line: line(st, 'unknown'), face: 'pout', lockSec: 1 }));
    }
    const missWith = (card, always) => {
      st.stats.misses++; st.stats.missTimes.push(now);
      if (always) st.stats.alwaysMiss++; else st.stats.diceMiss++;
      ev.kind = 'miss'; ev.card = card; ev.face = 'smug'; ev.lockSec = R.missLockSec;
      ev.line = huff ? line(st, 'huh') : CARDS[card].line;
      let d = R.cardDelta[card] || 0;
      if (card === 3 && st.rng() >= R.pronounDeltaChance) d = 0;
      if (card === 7 || card === 8) {
        st.warnings++; addMood(st, R.mood.hardWarn); ev.warn = st.warnings;
        if (st.warnings >= R.breakAt) { st.status = 'broke'; ev.kind = 'broke'; ev.line = line(st, 'broke'); ev.face = 'angry'; }
        else ev.sub = line(st, 'hard');
      }
      if (card === 9) ev.lockSec = R.slowSec;
      if (card === 16) ev.lockSec = R.freezeSec;
      if (card === 5) st.pocket = true;
      if (card === 1 && p.earUnref) ev.mirror = p.earUnref === 'L' ? 'R' : 'L';
      if (card === 19 && st.lastEffect && st.lastEffect.delta > 0) d = st.lastEffect.delta;
      ev.delta = d; ev.added = addCrossings(st, d);
      st.lastEffect = { delta: d };
      return done(ev);
    };
    // ⑦ 항상 오해
    if ((p.dir === '왼쪽' || p.dir === '오른쪽') && !p.dirRef) return missWith(1, true);
    if ((p.dir === '위' || p.dir === '아래') && !p.dirRef && (R.alwaysMissUpDownWithTag || !p.target)) return missWith(p.verb === '올려' || p.verb === '내려' ? 14 : 2, true);
    if (p.pronoun) return missWith(3, true);
    // ⑧ 명확도
    let clarity = 2; // 0 명확, 1 보통, 2 애매
    if (p.target && (p.verb || p.meta)) clarity = (p.ref || p.dir) ? 0 : 1;
    // ⑨ 주사위
    const pr = R.miss[band(st.mood)][clarity];
    if (huff && !st.lastRefused && st.rng() < R.refuseLow) {
      st.lastRefused = true; st.stats.refusals++;
      return done(Object.assign(ev, { kind: 'refuse', line: line(st, 'refuse'), face: 'sulk', lockSec: 1 }));
    }
    st.lastRefused = false;
    let miss = st.rng() < pr;
    if (miss && clarity <= 1 && st.clearMissStreak >= R.pityAfter) miss = false; // 억울함 방지
    if (miss) {
      if (clarity <= 1) { st.clearMissStreak++; st.stats.maxClearStreak = Math.max(st.stats.maxClearStreak, st.clearMissStreak); }
      // ⑩ 카드 고르기: 세게 > 살살 > 빨리 > 메타 > 동사
      let card = p.mods.hard ? 8 : p.mods.soft ? 9 : p.mods.fast ? 15 : (p.meta && VERB_CARD[p.meta]) || VERB_CARD[p.verb] || 99;
      if (p.verb === '넣어' && /고리/.test(p.raw) && st.rng() < 0.5) card = 17;
      return missWith(card, false);
    }
    if (clarity <= 1) st.clearMissStreak = 0;
    // 제대로 수행
    let pp = p;
    if ((p.verb === '그대로' || p.meta === '그대로') && st.lastParsed) pp = st.lastParsed;
    if (p.meta === '멈춰' && !p.verb) return done(Object.assign(ev, { kind: 'stop', line: '멈췄어.', face: 'pout' }));
    const c = findMatch(st, pp.target, pp.verb === '통과' ? '넣어' : pp.verb, pp.mods);
    st.lastParsed = pp;
    if (pp.mods.hard) { // 세게는 제대로 해도 위험
      st.warnings++; addMood(st, R.mood.hardWarn); ev.warn = st.warnings;
      if (st.warnings >= R.breakAt) { st.status = 'broke'; return done(Object.assign(ev, { kind: 'broke', line: line(st, 'broke'), face: 'angry' })); }
      if (c && c.type === 'knot') return done(Object.assign(ev, { kind: 'tighten', line: '더 조여졌는데?', face: 'pout', lockSec: R.actSec }));
    }
    if (c) {
      if (c.type === 'knot' && pp.verb === '당겨' && !pp.mods.soft) {
        st.warnings++; ev.warn = st.warnings; ev.sub = line(st, 'hard');
        if (st.warnings >= R.breakAt) { st.status = 'broke'; return done(Object.assign(ev, { kind: 'broke', line: line(st, 'broke'), face: 'angry' })); }
      }
      const r = resolve(st, c, 'voice');
      ev.kind = 'good'; ev.face = 'happy'; ev.lockSec = R.actSec + (pp.mods.soft ? 2 : 0);
      ev.removed = r.removed || null; ev.loosened = r.loosened || null; ev.became = r.became || null;
      ev.line = politeLine || (huff ? line(st, 'huh') : (r.loosened ? '매듭 풀렸다! 이제 걸린 것만' : line(st, 'good')));
      st.lastEffect = { delta: -1 };
      return done(ev);
    }
    st.stats.noop++;
    st.lastEffect = { delta: 0 };
    return done(Object.assign(ev, { kind: 'noop', line: politeLine || (huff ? line(st, 'huh') : line(st, 'noop')), face: 'pout', lockSec: R.actSec }));
  }

  // 직접 하기 시작/끝
  function startDirect(st, now) {
    st.directUses++; st.voiceOnly = false; if (st.firstDirectAt == null) st.firstDirectAt = now;
    addMood(st, RULES.mood.direct);
    const ev = { kind: 'direct', line: line(st, 'direct'), face: 'sulk', sec: RULES.direct.sec, cap: RULES.direct.handCap };
    st.stats.moodTrace.push([Math.round(now), st.mood]);
    if (st.mood <= 0) { st.status = 'leave'; ev.kind = 'leave'; ev.line = line(st, 'leave'); }
    return ev;
  }
  function handResolve(st, c) { const r = resolve(st, c, 'hand'); const e = { kind: 'hand', removed: r.removed || null, loosened: r.loosened || null, became: r.became || null }; checkEnd(st, e); return e; }
  function endDirect(st) { return { kind: 'direct-end', line: line(st, 'directEnd'), face: 'pout' }; }
  function checkEnd(st, ev) {
    if (st.status === 'play' && st.crossings.length === 0) {
      st.status = 'clear'; addMood(st, RULES.mood.clear);
      ev.cleared = true; ev.clearLine = st.voiceOnly ? line(st, 'clear') : '결국 네가 하네';
    }
    return ev;
  }
  function timeUp(st) { if (st.status === 'play') st.status = 'timeup'; }

  function describe(c) { return DESC[c.type](c); }
  function hint(c) { return HINT[c.type]; }

  // 결과 칭호
  function title(r) {
    if (r.status === 'broke') return '이어폰 파괴자';
    if (r.status === 'leave') return '동생 울린 사람';
    if (r.status === 'timeup') return '시간 순삭러';
    if (r.voiceOnly && r.yells === 0 && r.misses <= 2) return '말빨 장인';
    if (r.voiceOnly && r.yells === 0) return '인내심 만렙';
    if (r.voiceOnly) return '목청 장인';
    if (r.handRatio >= 0.5) return '결국 내가 함';
    return '반반 치킨';
  }

  // 묶기 라운드 심사 (페이퍼 7-1)
  function judgeTie(t) {
    // t: {secs, earDiff(0~1), endDiff(0~1), tight(0~1), rng}
    const rng = t.rng || Math.random;
    const holdChance = Math.max(0.05, Math.min(0.97, 0.15 + t.tight * 0.9 - t.earDiff * 0.25));
    const held = rng() < holdChance;
    let s = 0; const parts = [];
    if (held) { s += 2; parts.push(['10걸음 걸어도 안 풀림', 2]); } else parts.push(['걷다가 풀림', 0]);
    const ears = t.earDiff < 0.25; if (ears) s += 1; parts.push(['귀 두 개 크기 비슷', ears ? 1 : 0]);
    const ends = t.endDiff < 0.25; if (ends) s += 1; parts.push(['끈 끝 길이 비슷', ends ? 1 : 0]);
    const fast = t.secs <= 60; if (fast) s += 1; parts.push(['60초 안에 끝냄', fast ? 1 : 0]);
    const ln = s >= 5 ? '오… 인정.' : s >= 3 ? '봐줄게.' : '다시 해. 나방이잖아.';
    return { score: s, held, parts, line: ln, holdChance };
  }

  return { PAPER_RULES, CARDS, LINES, TAGS, parse, setRules, getRules: () => RULES, newRound, step, startDirect, handResolve, endDirect, timeUp,
    crossCount, knotCount, describe, hint, obj, subj, title, judgeTie, band, findMatch };
});
