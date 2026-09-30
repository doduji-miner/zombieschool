(function () {
  "use strict";

  /* ---- 지도 데이터: 구역 8개, 통로 11개 ---- */
  const ZONES = [
    { name: "교실",     icon: "✏️", x: 110, y: 390 },
    { name: "도서관",   icon: "📚", x: 110, y: 140 },
    { name: "중앙복도", icon: "🚶", x: 320, y: 280 },
    { name: "과학실",   icon: "🧪", x: 340, y: 95  },
    { name: "급식실",   icon: "🍱", x: 470, y: 390 },
    { name: "교무실",   icon: "📋", x: 570, y: 215 },
    { name: "체육관",   icon: "🏀", x: 700, y: 390 },
    { name: "대피소",   icon: "🚪", x: 710, y: 95  }
  ];

  const EDGES = [
    [0, 2], [0, 1], [1, 3], [2, 3], [2, 4], [2, 5],
    [3, 5], [4, 6], [4, 5], [5, 7], [6, 7]
  ];

  const START = 0;          // 나는 교실에서 시작
  const LAB = 3;            // 과학실(해독제)
  const EXIT = 7;           // 대피소
  const MAX_BARRICADES = 2;

  // 좀비는 매번 체육관에서 시작한다(랜덤 없음).
  // 바리케이드 2개로 이길 방법이 있는지 전수 탐색으로 확인했다. 바리케이드 없이는 못 이긴다.
  const ZOMBIE_START = 6;

  /* ---- 게임 상태 ---- */
  let state;
  const AUTO_RESET_SEC = 5;   // 막힌 판은 이 초 뒤에 자동으로 새 판
  let autoResetTimer = null;

  function newState() {
    const z = ZOMBIE_START;
    return {
      me: START,
      zombie: z,
      hasAntidote: false,
      blocked: new Set(),
      barLeft: MAX_BARRICADES,
      moves: 0,
      turn: 1,
      over: false,
      infected: new Set([z]),
      log: []
    };
  }

  /* ---- 그래프 도우미 ---- */
  function edgeTouches(i, zone) {
    return EDGES[i][0] === zone || EDGES[i][1] === zone;
  }

  function otherEnd(i, zone) {
    return EDGES[i][0] === zone ? EDGES[i][1] : EDGES[i][0];
  }

  // 막히지 않은 통로로 이어진 이웃 구역
  function neighbors(zone) {
    const list = [];
    EDGES.forEach(function (_, i) {
      if (!state.blocked.has(i) && edgeTouches(i, zone)) list.push(otherEnd(i, zone));
    });
    return list;
  }

  // 아직 막히지 않은 통로 번호들 (내 위치와 상관없이 어느 통로든 막을 수 있다)
  function blockableEdges() {
    if (state.barLeft <= 0) return [];
    const list = [];
    EDGES.forEach(function (_, i) {
      if (!state.blocked.has(i)) list.push(i);
    });
    return list;
  }

  // BFS: from 구역에서 각 구역까지의 최단 칸 수
  function distancesFrom(from) {
    const dist = new Array(ZONES.length).fill(Infinity);
    dist[from] = 0;
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      neighbors(cur).forEach(function (n) {
        if (dist[n] === Infinity) {
          dist[n] = dist[cur] + 1;
          queue.push(n);
        }
      });
    }
    return dist;
  }

  // 더 이상 이길 수 없는 판인지 확인한다.
  // 바리케이드는 치우지 못하니, 지금 길이 끊겨 있으면 앞으로도 영영 못 간다.
  // 이길 수 없으면 이유(문장)를, 아직 가능하면 null을 돌려준다.
  function stuckReason() {
    if (neighbors(state.me).length === 0) {
      return ZONES[state.me].name + "의 통로가 모두 막혀 한 칸도 움직일 수 없어요.";
    }
    const fromMe = distancesFrom(state.me);
    if (!state.hasAntidote) {
      if (fromMe[LAB] === Infinity) return "과학실로 가는 길이 모두 막혀 해독제를 구할 수 없어요.";
      if (distancesFrom(LAB)[EXIT] === Infinity) return "과학실에서 대피소로 가는 길이 모두 막혀 탈출할 수 없어요.";
    } else if (fromMe[EXIT] === Infinity) {
      return "대피소로 가는 길이 모두 막혀 탈출할 수 없어요.";
    }
    return null;
  }

  /* ---- 한국어 조사 ---- */
  function ro(word) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const jong = code >= 0 && code < 11172 ? code % 28 : 0;
    return word + (jong === 0 || jong === 8 ? "로" : "으로");
  }

  /* ---- 기록 ---- */
  function addLog(kind, text) {
    state.log.unshift({ turn: state.turn, kind: kind, text: text });
  }

  /* ---- 내 행동 ---- */
  function moveTo(target) {
    if (state.over || neighbors(state.me).indexOf(target) === -1) return;

    const from = state.me;
    state.me = target;
    state.moves += 1;
    addLog("me", "나: " + ZONES[from].name + " → " + ro(ZONES[target].name) + " 이동");

    if (state.me === state.zombie) {
      addLog("zombie", "좀비가 있는 곳으로 들어가 버렸다!");
      return finish(false, ZONES[target].name + "에 좀비가 기다리고 있었어요.");
    }

    if (state.me === LAB && !state.hasAntidote) {
      state.hasAntidote = true;
      addLog("good", "🧪 해독제를 확보했다! 이제 대피소로!");
    }

    if (state.me === EXIT) {
      if (state.hasAntidote) {
        addLog("good", "🚪 해독제를 들고 대피소 도착!");
        return finish(true, "이동 " + state.moves + "칸, 바리케이드 " + (MAX_BARRICADES - state.barLeft) + "개로 탈출했어요.");
      }
      addLog("info", "대피소에 왔지만 해독제가 없다. 과학실부터!");
    }

    zombieTurn();
  }

  function placeBarricade(i) {
    if (state.over || blockableEdges().indexOf(i) === -1) return;

    state.blocked.add(i);
    state.barLeft -= 1;
    const a = ZONES[EDGES[i][0]].name;
    const b = ZONES[EDGES[i][1]].name;
    addLog("me", "나: " + a + " ↔ " + b + " 통로에 바리케이드 설치 (남은 " + state.barLeft + "개)");

    zombieTurn();
  }

  /* ---- 좀비 차례 ---- */
  function zombieTurn() {
    const dist = distancesFrom(state.me);
    const z = state.zombie;

    if (dist[z] === Infinity) {
      addLog("zombie", "좀비: 길이 모두 막혀 " + ZONES[z].name + "에서 으르렁거릴 뿐이다.");
    } else {
      // 나에게 더 가까워지는 이웃 중 첫 번째로 한 칸 이동
      let next = z;
      neighbors(z).forEach(function (n) {
        if (dist[n] < dist[next]) next = n;
      });
      state.zombie = next;
      state.infected.add(next);
      addLog("zombie", "좀비: " + ZONES[z].name + " → " + ro(ZONES[next].name) + " 이동");
    }

    if (state.zombie === state.me) {
      return finish(false, ZONES[state.me].name + "에서 좀비에게 붙잡혔어요.");
    }

    if (neighbors(state.me).indexOf(state.zombie) !== -1) {
      addLog("zombie", "⚠️ 좀비가 바로 옆 " + ZONES[state.zombie].name + "에 있다!");
    }

    state.turn += 1;

    const reason = stuckReason();
    if (reason) {
      addLog("zombie", "⛔ " + reason);
      return finish(null, reason);
    }

    render();
  }

  /* ---- 게임 끝 ---- */
  // win: true = 승리, false = 잡힘, null = 더 이상 진행 불가(자동 초기화)
  function finish(win, detail) {
    state.over = true;
    render();
    const stuck = win === null;
    $("overlay-emoji").textContent = win ? "🎉" : stuck ? "⛔" : "🧟";
    $("overlay-title").textContent = win ? "탈출 성공!" : stuck ? "더 이상 진행할 수 없어요" : "좀비에게 잡혔다";
    $("overlay-text").textContent = detail;
    $("overlay").hidden = false;
    $("overlay-reset").focus();
    if (stuck) startAutoReset();
  }

  // 몇 초 세다가 강제로 새 판 시작
  function startAutoReset() {
    let left = AUTO_RESET_SEC;
    const box = $("overlay-countdown");
    box.hidden = false;
    box.textContent = left + "초 뒤 자동으로 초기화됩니다…";
    autoResetTimer = setInterval(function () {
      left -= 1;
      if (left <= 0) return reset();
      box.textContent = left + "초 뒤 자동으로 초기화됩니다…";
    }, 1000);
  }

  function stopAutoReset() {
    if (autoResetTimer !== null) clearInterval(autoResetTimer);
    autoResetTimer = null;
    $("overlay-countdown").hidden = true;
  }

  /* ---- 화면 요소 ---- */
  const SVG_NS = "http://www.w3.org/2000/svg";
  const $ = function (id) { return document.getElementById(id); };
  const svg = $("map");
  const edgeEls = [];
  const zoneEls = [];
  let meToken, zombieToken;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function activate(node, handler) {
    node.addEventListener("click", handler);
    node.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
  }

  function buildMap() {
    // 통로
    EDGES.forEach(function (e, i) {
      const a = ZONES[e[0]], b = ZONES[e[1]];
      const g = el("g", { class: "edge" }, svg);
      el("line", { class: "edge-line", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      el("line", { class: "edge-hit", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, g);
      const mark = el("text", {
        class: "barricade-mark", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 10, "text-anchor": "middle"
      }, g);
      mark.textContent = "🚧";
      activate(g, function () { if (g.classList.contains("can-block")) placeBarricade(i); });
      edgeEls.push({ g: g, mark: mark });
    });

    // 구역
    ZONES.forEach(function (z, i) {
      const g = el("g", { class: "zone" + (i === LAB ? " lab" : "") + (i === EXIT ? " exit" : "") }, svg);
      el("circle", { class: "zone-body", cx: z.x, cy: z.y, r: 42 }, g);
      el("text", { class: "zone-icon", x: z.x, y: z.y + 13 }, g).textContent = z.icon;
      el("text", { class: "zone-name", x: z.x, y: z.y + 72 }, g).textContent = z.name;
      activate(g, function () { if (g.classList.contains("can-move")) moveTo(i); });
      zoneEls.push(g);
    });

    // 말
    meToken = el("g", { class: "token me" }, svg);
    el("circle", { class: "ring", cx: 0, cy: -12, r: 26 }, meToken);
    el("text", { x: 0, y: 2 }, meToken).textContent = "🧑‍🎓";

    zombieToken = el("g", { class: "token zombie" }, svg);
    el("circle", { class: "ring", cx: 0, cy: -12, r: 26 }, zombieToken);
    el("text", { x: 0, y: 2 }, zombieToken).textContent = "🧟";
  }

  function placeToken(token, zone, dx) {
    const z = ZONES[zone];
    token.setAttribute("transform", "translate(" + (z.x + dx) + "," + (z.y - 40) + ")");
  }

  /* ---- 그리기 ---- */
  function render() {
    const canMove = state.over ? [] : neighbors(state.me);
    const canBlock = state.over ? [] : blockableEdges();

    // 통로
    edgeEls.forEach(function (item, i) {
      const blocked = state.blocked.has(i);
      const blockable = canBlock.indexOf(i) !== -1;
      item.g.classList.toggle("blocked", blocked);
      item.g.classList.toggle("can-block", blockable);
      item.mark.style.display = blocked ? "" : "none";
      if (blockable) {
        item.g.setAttribute("tabindex", "0");
        item.g.setAttribute("role", "button");
        item.g.setAttribute("aria-label", ZONES[EDGES[i][0]].name + "와 " + ZONES[EDGES[i][1]].name + " 사이 통로 막기");
      } else {
        item.g.removeAttribute("tabindex");
        item.g.removeAttribute("role");
        item.g.removeAttribute("aria-label");
      }
    });

    // 구역
    zoneEls.forEach(function (g, i) {
      const movable = canMove.indexOf(i) !== -1;
      g.classList.toggle("can-move", movable);
      g.classList.toggle("infected", state.infected.has(i));
      if (movable) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", ro(ZONES[i].name) + " 이동");
      } else {
        g.removeAttribute("tabindex");
        g.removeAttribute("role");
        g.removeAttribute("aria-label");
      }
    });

    // 말 (같은 칸이면 겹치지 않게 양옆으로)
    placeToken(meToken, state.me, state.me === state.zombie ? -30 : 0);
    placeToken(zombieToken, state.zombie, state.me === state.zombie ? 30 : 0);

    // 미션
    $("mission-1").classList.toggle("done", state.hasAntidote);
    $("mission-2").classList.toggle("done", state.hasAntidote && state.me === EXIT);

    // 수치
    let bars = "";
    for (let k = 0; k < MAX_BARRICADES; k++) {
      bars += '<span class="' + (k < state.barLeft ? "" : "used") + '">🚧</span>';
    }
    $("bar-count").innerHTML = bars + ' <span class="sr">' + state.barLeft + "/" + MAX_BARRICADES + "</span>";
    $("move-count").textContent = state.moves;
    $("turn-count").textContent = state.turn;

    // 현재 위치
    $("current-place").textContent = ZONES[state.me].name + (state.hasAntidote ? " 🧪" : "");
    $("zombie-place").textContent = "🧟 좀비 위치: " + ZONES[state.zombie].name;

    // 버튼 목록
    const moveBox = $("move-buttons");
    moveBox.innerHTML = "";
    if (canMove.length === 0) {
      moveBox.innerHTML = '<p class="empty">' + (state.over ? "게임이 끝났어요." : "갈 수 있는 길이 없어요.") + "</p>";
    }
    canMove.forEach(function (n) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = ZONES[n].icon + " " + ZONES[n].name;
      btn.addEventListener("click", function () { moveTo(n); });
      moveBox.appendChild(btn);
    });

    const barBox = $("bar-buttons");
    barBox.innerHTML = "";
    if (canBlock.length === 0) {
      barBox.innerHTML = '<p class="empty">' +
        (state.over ? "게임이 끝났어요." : state.barLeft === 0 ? "바리케이드를 모두 썼어요." : "막을 수 있는 통로가 없어요.") + "</p>";
    }
    canBlock.forEach(function (i) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bar-btn";
      btn.textContent = "🚧 " + ZONES[EDGES[i][0]].name + " ↔ " + ZONES[EDGES[i][1]].name;
      btn.addEventListener("click", function () { placeBarricade(i); });
      barBox.appendChild(btn);
    });

    // 상황 기록
    const logList = $("log-list");
    logList.innerHTML = "";
    state.log.forEach(function (entry) {
      const li = document.createElement("li");
      li.className = entry.kind;
      const t = document.createElement("span");
      t.className = "log-turn";
      t.textContent = "턴 " + entry.turn;
      const msg = document.createElement("span");
      msg.className = "log-text";
      msg.textContent = entry.text;
      li.appendChild(t);
      li.appendChild(msg);
      logList.appendChild(li);
    });
  }

  /* ---- 초기화 ---- */
  function reset() {
    stopAutoReset();
    state = newState();
    addLog("zombie", "🧟 " + ZONES[state.zombie].name + "에서 좀비가 나타났다!");
    addLog("info", "나는 교실에 있다. 과학실의 해독제를 챙겨 대피소로 가자.");
    $("overlay").hidden = true;
    render();
  }

  $("reset-btn").addEventListener("click", reset);
  $("overlay-reset").addEventListener("click", reset);

  buildMap();
  reset();
})();
